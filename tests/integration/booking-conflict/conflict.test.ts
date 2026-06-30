import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { createBookingForUser } from "@/server/booking/create-booking";
import { localDateTimeToUtc } from "@/domain/time";

// Teste de integração (toca Postgres) — garante a não-sobreposição NO NÍVEL DE DADOS sob
// concorrência (FR-008/FR-009) e a tradução do erro de exclusion constraint em slot_unavailable
// (FR-015). Usa a barbearia/serviço semeados.
const SP = "America/Sao_Paulo";
const BARBERSHOP_ID = "barbershop-trimote";
const SERVICE_ID = "service-corte"; // duração 30min no seed
const TEST_USER_ID = "u-it-conflict";

// 2026-12-02 é quarta-feira (com expediente); 10:00 SP cabe em 09:00–18:00 e é futuro.
const startsAt = localDateTimeToUtc("2026-12-02", 10 * 60, SP);

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: { id: TEST_USER_ID, email: "it-conflict@example.com" },
  });
});

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { userId: TEST_USER_ID } });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId: TEST_USER_ID } });
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
