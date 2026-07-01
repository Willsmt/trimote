import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { getAvailableSlots } from "@/server/actions/get-available-slots";
import {
  SERVICE_CORTE,
  cleanupBookings,
  seedBooking,
  slotAt,
  teardownUsers,
  upsertUsers,
} from "./fixtures";

// Teste de integração (Postgres) — exclude-self (FR-002/FR-004, D1). Ao calcular a disponibilidade
// para a remarcação de um booking, o próprio booking NÃO deve bloquear o próprio horário nem as
// adjacências. Deve FALHAR antes de T003 (parâmetro excludeBookingId inexistente).
const DATE = "2026-12-14"; // segunda-feira, dentro do expediente 09:00–18:00
const USER = "u-it-resch-exself";

const startMinutes = 10 * 60; // 10:00

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "resch-exself@example.com" }]);
});

afterEach(async () => {
  await cleanupBookings([USER]);
});

afterAll(async () => {
  await teardownUsers([USER]);
});

describe("getAvailableSlots + excludeBookingId (exclude-self)", () => {
  it("sem exclude, o horário do próprio booking aparece OCUPADO", async () => {
    await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, startMinutes) });

    const result = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE });
    if (!result.ok) throw new Error("disponibilidade falhou");

    const ownIso = slotAt(DATE, startMinutes).toISOString();
    expect(result.slots).not.toContain(ownIso);
  });

  it("com excludeBookingId, o horário atual do booking volta a ser ofertado", async () => {
    const bookingId = await seedBooking({
      userId: USER,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, startMinutes),
    });

    const result = await getAvailableSlots({
      serviceId: SERVICE_CORTE,
      date: DATE,
      excludeBookingId: bookingId,
    });
    if (!result.ok) throw new Error("disponibilidade falhou");

    const ownIso = slotAt(DATE, startMinutes).toISOString();
    // O próprio horário e as adjacências (09:30 e 10:30) devem estar livres.
    expect(result.slots).toContain(ownIso);
    expect(result.slots).toContain(slotAt(DATE, startMinutes - 30).toISOString());
    expect(result.slots).toContain(slotAt(DATE, startMinutes + 30).toISOString());
  });
});
