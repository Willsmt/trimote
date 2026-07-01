import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { rescheduleBookingForUser } from "@/server/booking/reschedule-booking";
import {
  SERVICE_CORTE,
  SERVICE_CORTE_BARBA,
  cleanupBookings,
  seedBooking,
  slotAt,
  teardownUsers,
  upsertUsers,
} from "./fixtures";

// Teste de integração (Postgres) — troca de serviço / encaixe (FR-004, SC-002). Ao trocar para um
// serviço de duração MAIOR, o encaixe no expediente passa a usar a duração do serviço ESCOLHIDO:
// só horários onde ele cabe inteiro são aceitos; alvo onde não cabe → outside_opening_hours.
const DATE = "2026-12-21"; // segunda-feira, expediente 09:00–18:00
const USER = "u-it-resch-svcchange";

const FROM = 10 * 60; // 10:00 (booking original, Corte 30min)

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "resch-svcchange@example.com" }]);
});

afterEach(async () => {
  await cleanupBookings([USER]);
});

afterAll(async () => {
  await teardownUsers([USER]);
});

describe("rescheduleBookingForUser (troca de serviço / encaixe)", () => {
  it("troca para serviço maior em horário onde cabe → move e recalcula endsAt pela nova duração", async () => {
    const bookingId = await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, FROM) });

    // 14:00 + 60min (Corte + Barba) = 15:00, cabe em 09:00–18:00.
    const target = 14 * 60;
    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: SERVICE_CORTE_BARBA,
      startsAt: slotAt(DATE, target),
    });

    expect(result).toEqual({ ok: true, bookingId });

    const moved = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(moved.serviceId).toBe(SERVICE_CORTE_BARBA);
    expect(moved.startsAt.toISOString()).toBe(slotAt(DATE, target).toISOString());
    expect(moved.endsAt.toISOString()).toBe(slotAt(DATE, target + 60).toISOString());
  });

  it("troca para serviço maior em horário onde NÃO cabe → outside_opening_hours", async () => {
    const bookingId = await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, FROM) });

    // 17:30 + 60min = 18:30, ultrapassa o fechamento (18:00) — não cabe.
    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: SERVICE_CORTE_BARBA,
      startsAt: slotAt(DATE, 17 * 60 + 30),
    });

    expect(result).toEqual({ ok: false, reason: "outside_opening_hours" });

    // Recusa não altera o booking (FR-009).
    const original = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(original.serviceId).toBe(SERVICE_CORTE);
    expect(original.startsAt.toISOString()).toBe(slotAt(DATE, FROM).toISOString());
  });
});
