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

// Teste de integração (Postgres) — no_change (FR-012). Mesmo serviço E mesmo horário → recusa
// amigável sem UPDATE.
const DATE = "2026-12-18"; // sexta-feira (dia próprio, evita colisão com outros testes)
const USER = "u-it-resch-nochange";
const AT = 11 * 60; // 11:00

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "resch-nochange@example.com" }]);
});

afterEach(async () => {
  await cleanupBookings([USER]);
});

afterAll(async () => {
  await teardownUsers([USER]);
});

describe("rescheduleBookingForUser (no_change)", () => {
  it("mesmo serviço e mesmo horário → no_change sem alterar o booking", async () => {
    const bookingId = await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, AT) });
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });

    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, AT),
    });

    expect(result).toEqual({ ok: false, reason: "no_change" });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.startsAt.toISOString()).toBe(before.startsAt.toISOString());
    expect(after.endsAt.toISOString()).toBe(before.endsAt.toISOString());
    expect(after.serviceId).toBe(before.serviceId);
  });
});
