import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { getAvailableSlots } from "@/server/actions/get-available-slots";
import { rescheduleBookingForUser } from "@/server/booking/reschedule-booking";
import {
  SERVICE_CORTE,
  cleanupBookings,
  seedBooking,
  slotAt,
  teardownUsers,
  upsertUsers,
} from "./fixtures";

// Teste de integração (Postgres) — mover + liberar (FR-001/FR-003, SC-001/SC-003). O booking é
// movido (MESMA id) para um horário livre; o horário antigo volta a ser ofertado como livre.
const DATE = "2026-12-15"; // terça-feira, expediente 09:00–18:00
const USER = "u-it-resch-move";

const FROM = 10 * 60; // 10:00
const TO = 14 * 60; // 14:00

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "resch-move@example.com" }]);
});

afterEach(async () => {
  await cleanupBookings([USER]);
});

afterAll(async () => {
  await teardownUsers([USER]);
});

describe("rescheduleBookingForUser (mover + liberar)", () => {
  it("move o booking mantendo a identidade e recalcula endsAt", async () => {
    const bookingId = await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, FROM) });

    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, TO),
    });

    expect(result).toEqual({ ok: true, bookingId });

    const moved = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(moved.startsAt.toISOString()).toBe(slotAt(DATE, TO).toISOString());
    expect(moved.endsAt.toISOString()).toBe(slotAt(DATE, TO + 30).toISOString()); // Corte = 30min
    expect(moved.status).toBe("ACTIVE");
  });

  it("libera o horário antigo (volta a ser ofertado) e ocupa o novo", async () => {
    const bookingId = await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, FROM) });

    await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, TO),
    });

    const avail = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE });
    if (!avail.ok) throw new Error("disponibilidade falhou");

    expect(avail.slots).toContain(slotAt(DATE, FROM).toISOString()); // antigo liberado
    expect(avail.slots).not.toContain(slotAt(DATE, TO).toISOString()); // novo ocupado
  });
});
