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

// Teste de integração (Postgres) — conflito/concorrência (FR-006/FR-009, SC-007). Mover para um alvo
// ocupado por outro booking ACTIVE → slot_unavailable; o booking original permanece intacto. Sob
// concorrência, no máximo um move para o mesmo alvo livre é aceito.
const DATE = "2026-12-17"; // quinta-feira
const USER_A = "u-it-resch-conf-a";
const USER_B = "u-it-resch-conf-b";

const A_FROM = 10 * 60; // 10:00 (booking a mover)
const OCCUPIED = 14 * 60; // 14:00 (ocupado por B)
const FREE = 16 * 60; // 16:00 (livre, para concorrência)

beforeAll(async () => {
  await upsertUsers([
    { id: USER_A, email: "resch-conf-a@example.com" },
    { id: USER_B, email: "resch-conf-b@example.com" },
  ]);
});

afterEach(async () => {
  await cleanupBookings([USER_A, USER_B]);
});

afterAll(async () => {
  await teardownUsers([USER_A, USER_B]);
});

describe("rescheduleBookingForUser (conflito)", () => {
  it("mover para alvo ocupado → slot_unavailable e original intacto", async () => {
    const bookingA = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, A_FROM) });
    await seedBooking({ userId: USER_B, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, OCCUPIED) });

    const result = await rescheduleBookingForUser({
      userId: USER_A,
      bookingId: bookingA,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, OCCUPIED),
    });

    expect(result).toEqual({ ok: false, reason: "slot_unavailable" });

    const original = await prisma.booking.findUniqueOrThrow({ where: { id: bookingA } });
    expect(original.startsAt.toISOString()).toBe(slotAt(DATE, A_FROM).toISOString());
    expect(original.status).toBe("ACTIVE");
  });

  it("sob concorrência para o mesmo alvo livre, no máximo um move é aceito", async () => {
    const bookingA = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, A_FROM) });
    const bookingB = await seedBooking({ userId: USER_B, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, OCCUPIED) });

    const results = await Promise.all([
      rescheduleBookingForUser({ userId: USER_A, bookingId: bookingA, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, FREE) }),
      rescheduleBookingForUser({ userId: USER_B, bookingId: bookingB, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, FREE) }),
    ]);

    const successes = results.filter((r) => r.ok).length;
    const unavailable = results.filter((r) => !r.ok && r.reason === "slot_unavailable").length;

    expect(successes).toBe(1);
    expect(unavailable).toBe(1);

    const atTarget = await prisma.booking.count({
      where: { status: "ACTIVE", startsAt: slotAt(DATE, FREE) },
    });
    expect(atTarget).toBe(1);
  });
});
