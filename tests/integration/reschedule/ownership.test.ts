import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { rescheduleBookingForUser } from "@/server/booking/reschedule-booking";
import {
  SERVICE_CORTE,
  cleanupBookings,
  seedBooking,
  slotAt,
  teardownUsers,
  upsertUsers,
} from "./fixtures";

// Teste de integração (Postgres) — ownership/elegibilidade (FR-007/FR-008/FR-009, SC-005/SC-006).
// Exercita as guardas JÁ implementadas no core (T005, Foundational): nenhuma dessas recusas pode
// alterar o booking.
const DATE = "2026-12-23"; // quarta-feira, expediente 09:00–18:00
const USER_A = "u-it-resch-own-a";
const USER_B = "u-it-resch-own-b";

beforeAll(async () => {
  await upsertUsers([
    { id: USER_A, email: "resch-own-a@example.com" },
    { id: USER_B, email: "resch-own-b@example.com" },
  ]);
});

afterEach(async () => {
  await cleanupBookings([USER_A, USER_B]);
});

afterAll(async () => {
  await teardownUsers([USER_A, USER_B]);
});

async function expectUnchanged(bookingId: string, expected: { startsAt: Date; serviceId: string; status: string }) {
  const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  expect(row.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
  expect(row.serviceId).toBe(expected.serviceId);
  expect(row.status).toBe(expected.status);
}

describe("rescheduleBookingForUser (ownership/elegibilidade — guardas do T005)", () => {
  it("not_owner: um não-dono não remarca o booking de outro (e nada muda)", async () => {
    const startsAt = slotAt(DATE, 10 * 60);
    const bookingId = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt });

    const result = await rescheduleBookingForUser({
      userId: USER_B, // não é o dono
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 14 * 60),
    });

    expect(result).toEqual({ ok: false, reason: "not_owner" });
    await expectUnchanged(bookingId, { startsAt, serviceId: SERVICE_CORTE, status: "ACTIVE" });
  });

  it("not_active: um agendamento cancelado não pode ser remarcado (e nada muda)", async () => {
    const startsAt = slotAt(DATE, 11 * 60);
    const bookingId = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt, status: "CANCELLED" });

    const result = await rescheduleBookingForUser({
      userId: USER_A,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 15 * 60),
    });

    expect(result).toEqual({ ok: false, reason: "not_active" });
    await expectUnchanged(bookingId, { startsAt, serviceId: SERVICE_CORTE, status: "CANCELLED" });
  });

  it("booking_in_past: um agendamento já iniciado/passado não pode ser remarcado (e nada muda)", async () => {
    const startsAt = slotAt(DATE, 12 * 60);
    const bookingId = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt });

    // now DEPOIS do início do booking → fronteira pelo início (FR-008).
    const now = new Date(startsAt.getTime() + 60_000);
    const result = await rescheduleBookingForUser({
      userId: USER_A,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 16 * 60),
      now,
    });

    expect(result).toEqual({ ok: false, reason: "booking_in_past" });
    await expectUnchanged(bookingId, { startsAt, serviceId: SERVICE_CORTE, status: "ACTIVE" });
  });
});
