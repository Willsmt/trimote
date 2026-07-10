import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { createBookingForUser } from "@/server/booking/create-booking";
import { rescheduleBookingForUser } from "@/server/booking/reschedule-booking";
import {
  BUSINESS_ID,
  SERVICE_CORTE,
  seedBooking,
  slotAt,
  upsertUsers,
  cleanupLedgerAndBookings,
} from "../ledger/fixtures";
import { createTestBusiness, cleanupBusinesses } from "../multitenancy/fixtures";

/**
 * Integração (Postgres) do LIMITE de agendamentos ativos por cliente por negócio (issue #27).
 * Proteção da página pública exposta (QR): máximo N=3 bookings ACTIVE FUTUROS (startsAt > now) por
 * (userId, businessId). Decisões: ACTIVE passados não contam (inércia do dono não pune o cliente);
 * cancelado/concluído não contam; escopo por negócio (N em A não bloqueia B); remarcação passa livre
 * (UPDATE da mesma linha — não aumenta o total); concorrência fechada por advisory xact lock com
 * ordem lock → count → create (corrida residual aqui derrotaria a feature, diferente da #11).
 *
 * TEST-FIRST (RED por COMPORTAMENTO — o core existe): os casos de BLOQUEIO (N bloqueia; concorrência)
 * falham hoje porque a criação além do limite retorna ok. Os casos de PERMISSÃO são pinos de
 * regressão: já passam e devem SOBREVIVER ao GREEN (protegem contra sobre-bloqueio).
 */

const CLIENT_ID = "u-it-limit-client";
const DATE = "2026-12-03"; // quinta-feira (expediente no seed); dia exclusivo deste arquivo
const PAST_DATE = "2026-12-01"; // terça-feira — anterior a NOW (bookings ACTIVE "passados")
// "Agora" injetado: 08:00 locais do dia de teste (antes da abertura) — determinístico, tudo em
// DATE é futuro e tudo em PAST_DATE é passado, independente de quando a suíte roda.
const NOW = slotAt(DATE, 8 * 60);

const BIZ_B = "biz-limit-b";
const SVC_B = "svc-limit-b";
const D = (v: string) => new Prisma.Decimal(v);

/** Semeia `count` bookings ACTIVE futuros do cliente em DATE, a partir de 10:00, passo 30min. */
async function seedActiveFuture(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(
      await seedBooking({
        userId: CLIENT_ID,
        serviceId: SERVICE_CORTE,
        startsAt: slotAt(DATE, 10 * 60 + i * 30),
      }),
    );
  }
  return ids;
}

async function activeCount(businessId = BUSINESS_ID): Promise<number> {
  return prisma.booking.count({
    where: { userId: CLIENT_ID, businessId, status: "ACTIVE" },
  });
}

beforeAll(async () => {
  await upsertUsers([{ id: CLIENT_ID, email: "limit-client@example.com" }]);
  // Negócio B (escopo por negócio): serviço + expediente na quinta (weekday 4) para a criação passar.
  await createTestBusiness({ id: BIZ_B, name: "Limit B", slug: "limit-b" });
  await prisma.service.upsert({
    where: { id: SVC_B },
    update: {},
    create: { id: SVC_B, businessId: BIZ_B, name: "Corte B", price: D("35.00"), durationMinutes: 30 },
  });
  await prisma.openingHours.upsert({
    where: { businessId_weekday: { businessId: BIZ_B, weekday: 4 } },
    update: { opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60 },
    create: { businessId: BIZ_B, weekday: 4, opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60 },
  });
});

afterEach(async () => {
  await cleanupLedgerAndBookings([CLIENT_ID]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([CLIENT_ID]);
  await cleanupBusinesses([BIZ_B]);
  await prisma.user.deleteMany({ where: { id: CLIENT_ID } });
  await prisma.$disconnect();
});

describe("limite de agendamentos ativos por cliente por negocio (issue #27, N=3)", () => {
  it("com N-1 ativos futuros, o N-esimo agendamento e permitido", async () => {
    await seedActiveFuture(2);

    const result = await createBookingForUser({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 12 * 60),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(await activeCount()).toBe(3);
  });

  it("com N ativos futuros -> booking_limit_reached e NADA criado", async () => {
    await seedActiveFuture(3);

    const result = await createBookingForUser({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 14 * 60),
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "booking_limit_reached" });
    expect(await activeCount()).toBe(3); // o 4o nao entrou
  });

  it("cancelados e concluidos NAO contam no limite", async () => {
    await seedActiveFuture(2);
    await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 13 * 60),
      status: "CANCELLED",
    });
    await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 13 * 60 + 30),
      status: "COMPLETED",
    });

    const result = await createBookingForUser({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 15 * 60),
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it("escopo por negocio: N ativos em A NAO bloqueia criacao em B", async () => {
    await seedActiveFuture(3); // lota o limite no negocio A (seed)

    const result = await createBookingForUser({
      userId: CLIENT_ID,
      serviceId: SVC_B,
      startsAt: slotAt(DATE, 10 * 60),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(await activeCount(BIZ_B)).toBe(1);
  });

  it("ACTIVE com startsAt no PASSADO nao conta (inercia do dono nao pune o cliente)", async () => {
    // 3 ACTIVE passados (dono esqueceu de concluir) — startsAt < NOW.
    for (let i = 0; i < 3; i += 1) {
      await seedBooking({
        userId: CLIENT_ID,
        serviceId: SERVICE_CORTE,
        startsAt: slotAt(PAST_DATE, 10 * 60 + i * 30),
      });
    }

    const result = await createBookingForUser({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 10 * 60),
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it("remarcacao passa LIVRE no limite (UPDATE da mesma linha, nao aumenta o total)", async () => {
    const [first] = await seedActiveFuture(3); // cliente no limite

    const result = await rescheduleBookingForUser({
      userId: CLIENT_ID,
      bookingId: first,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 16 * 60),
      now: NOW,
    });

    expect(result).toEqual({ ok: true, bookingId: first });
    expect(await activeCount()).toBe(3); // total inalterado
  });

  it("concorrencia: com N-1 ativos, duas criacoes simultaneas -> exatamente 1 ok e 1 booking_limit_reached", async () => {
    await seedActiveFuture(2);

    // Horarios DISTINTOS e nao adjacentes ao seed: a exclusion constraint (overlap) nao participa —
    // so o limite decide. Sem o advisory lock (lock -> count -> create), ambas contam 2 e ambas criam.
    const [a, b] = await Promise.all([
      createBookingForUser({
        userId: CLIENT_ID,
        serviceId: SERVICE_CORTE,
        startsAt: slotAt(DATE, 16 * 60),
        now: NOW,
      }),
      createBookingForUser({
        userId: CLIENT_ID,
        serviceId: SERVICE_CORTE,
        startsAt: slotAt(DATE, 17 * 60),
        now: NOW,
      }),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "booking_limit_reached")).toHaveLength(1);
    expect(await activeCount()).toBe(3); // nunca N+1
  });
});
