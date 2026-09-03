import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { createBookingForUser } from "@/server/booking/create-booking";
import { localDateTimeToUtc } from "@/domain/time";
import { createTestBusiness, cleanupBusinesses } from "../multitenancy/fixtures";

// Teste de integração (toca Postgres) — garante a não-sobreposição NO NÍVEL DE DADOS sob
// concorrência (FR-008/FR-009) e a tradução do erro de exclusion constraint em slot_unavailable
// (FR-015). Usa a barbearia/serviço semeados.
const SP = "America/Sao_Paulo";
const BUSINESS_ID = "business-trimote";
const SERVICE_ID = "service-corte"; // duração 30min no seed
const TEST_USER_ID = "u-it-conflict";

// 2026-12-02 é quarta-feira (com expediente); 10:00 SP cabe em 09:00–18:00 e é futuro.
const startsAt = localDateTimeToUtc("2026-12-02", 10 * 60, SP);

// Fixtures isoladas do snapshot de sinal (issue #56): negócios próprios, sem tocar o seed global,
// cada um com o par price/sinalPercentual que o caso de teste exige. Mesmo padrão de
// seedBusinessWithService de multitenancy/isolation.test.ts (expediente cobrindo só a quarta,
// único weekday usado por `startsAt` acima).
const D = (v: string) => new Prisma.Decimal(v);
const BIZ_SINAL_10 = "biz-cft-sinal10";
const SVC_SINAL_10 = "svc-cft-sinal10";
const BIZ_SINAL_7 = "biz-cft-sinal7";
const SVC_SINAL_7 = "svc-cft-sinal7";

async function seedBusinessComSinal(input: {
  businessId: string;
  slug: string;
  serviceId: string;
  price: string;
  sinalPercentual: number;
  chavePix?: string;
}) {
  await createTestBusiness({ id: input.businessId, name: input.businessId, slug: input.slug });
  await prisma.business.update({
    where: { id: input.businessId },
    data: { sinalPercentual: input.sinalPercentual, chavePix: input.chavePix ?? null },
  });
  await prisma.openingHours.upsert({
    where: { businessId_weekday: { businessId: input.businessId, weekday: 3 } },
    update: {},
    create: { businessId: input.businessId, weekday: 3, opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60 },
  });
  await prisma.service.upsert({
    where: { id: input.serviceId },
    update: {},
    create: {
      id: input.serviceId,
      businessId: input.businessId,
      name: "Corte",
      price: D(input.price),
      durationMinutes: 30,
    },
  });
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: { id: TEST_USER_ID, email: "it-conflict@example.com" },
  });
  await seedBusinessComSinal({
    businessId: BIZ_SINAL_10,
    slug: "cft-sinal10",
    serviceId: SVC_SINAL_10,
    price: "45.00",
    sinalPercentual: 10,
    chavePix: "alguma-chave",
  });
  await seedBusinessComSinal({
    businessId: BIZ_SINAL_7,
    slug: "cft-sinal7",
    serviceId: SVC_SINAL_7,
    price: "10.33",
    sinalPercentual: 7,
  });
});

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { userId: TEST_USER_ID } });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId: TEST_USER_ID } });
  await cleanupBusinesses([BIZ_SINAL_10, BIZ_SINAL_7]);
  await prisma.user.delete({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("createBookingForUser (conflito)", () => {
  it("cria um agendamento em horário livre", async () => {
    const result = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SERVICE_ID,
      startsAt,
    });
    expect(result.ok).toBe(true);
  });

  it("rejeita um segundo agendamento sobreposto como slot_unavailable (FR-015)", async () => {
    const first = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SERVICE_ID,
      startsAt,
    });
    expect(first.ok).toBe(true);

    const second = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SERVICE_ID,
      startsAt,
    });
    expect(second).toEqual({ ok: false, reason: "slot_unavailable" });
  });

  it("sob concorrência, no máximo um agendamento é criado (FR-008/FR-009)", async () => {
    const results = await Promise.all([
      createBookingForUser({ userId: TEST_USER_ID, serviceId: SERVICE_ID, startsAt }),
      createBookingForUser({ userId: TEST_USER_ID, serviceId: SERVICE_ID, startsAt }),
    ]);

    const successes = results.filter((r) => r.ok).length;
    const unavailable = results.filter((r) => !r.ok && r.reason === "slot_unavailable").length;

    expect(successes).toBe(1);
    expect(unavailable).toBe(1);

    const count = await prisma.booking.count({
      where: { userId: TEST_USER_ID, status: "ACTIVE" },
    });
    expect(count).toBe(1);
  });
});

describe("sinalValor (snapshot na criação, issue #56)", () => {
  it("é null quando o negócio não tem sinalPercentual configurado (estado atual do seed)", async () => {
    const result = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SERVICE_ID,
      startsAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("setup: createBookingForUser falhou");

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    expect(booking.sinalValor).toBeNull();
  });

  it("= price * sinalPercentual / 100 (45.00 x 10% = 4.50)", async () => {
    const result = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SVC_SINAL_10,
      startsAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("setup: createBookingForUser falhou");

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    expect(booking.sinalValor).not.toBeNull();
    expect(D(booking.sinalValor!.toString()).equals(D("4.50"))).toBe(true);
  });

  it("arredonda dízima pra 2 casas, half-up (10.33 x 7% = 0.7231 -> 0.72)", async () => {
    const result = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SVC_SINAL_7,
      startsAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("setup: createBookingForUser falhou");

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    expect(booking.sinalValor).not.toBeNull();
    expect(D(booking.sinalValor!.toString()).equals(D("0.72"))).toBe(true);
  });
});

describe("retorno de sucesso com sinalValorLabel + chavePix (issue #56)", () => {
  it("negócio com sinal e chave PIX -> sinalValorLabel formatado e chavePix repassada", async () => {
    const result = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SVC_SINAL_10,
      startsAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("setup: createBookingForUser falhou");

    // Intl.NumberFormat("pt-BR", {style:"currency"}) usa NBSP (U+00A0), não espaço comum.
    expect(result.sinalValorLabel).toBe("R$\u00A04,50");
    expect(result.chavePix).toBe("alguma-chave");
  });

  it("negócio sem sinal e sem chave PIX -> ambos null (estado atual do seed)", async () => {
    const result = await createBookingForUser({
      userId: TEST_USER_ID,
      serviceId: SERVICE_ID,
      startsAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("setup: createBookingForUser falhou");

    expect(result.sinalValorLabel).toBeNull();
    expect(result.chavePix).toBeNull();
  });
});
