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

// Teste de integração (Postgres) — alvo no passado + integridade sob concorrência
// (FR-005, SC-004/SC-007). Recusa não altera o booking; sob concorrência o original permanece intacto.
const DATE = "2026-12-28"; // segunda-feira, expediente 09:00–18:00
const USER_A = "u-it-resch-ref-a";
const USER_B = "u-it-resch-ref-b";

beforeAll(async () => {
  await upsertUsers([
    { id: USER_A, email: "resch-ref-a@example.com" },
    { id: USER_B, email: "resch-ref-b@example.com" },
  ]);
});

afterEach(async () => {
  await cleanupBookings([USER_A, USER_B]);
});

afterAll(async () => {
  await teardownUsers([USER_A, USER_B]);
});

describe("rescheduleBookingForUser (alvo no passado + concorrência)", () => {
  it("in_the_past: alvo no passado é recusado (e o booking não muda)", async () => {
    const startsAt = slotAt(DATE, 16 * 60); // booking futuro em relação ao now injetado
    const bookingId = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt });

    const now = slotAt(DATE, 12 * 60); // 12:00: booking (16:00) é futuro; alvo (09:00) é passado
    const result = await rescheduleBookingForUser({
      userId: USER_A,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 9 * 60), // alvo no passado relativo ao now
      now,
    });

    expect(result).toEqual({ ok: false, reason: "in_the_past" });

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.startsAt.toISOString()).toBe(startsAt.toISOString());
    expect(row.status).toBe("ACTIVE");
  });

  it("concorrência: dois moves ao mesmo alvo livre → um só vence, o outro intacto", async () => {
    const aStart = slotAt(DATE, 10 * 60);
    const bStart = slotAt(DATE, 11 * 60);
    const target = slotAt(DATE, 17 * 60); // livre

    const bookingA = await seedBooking({ userId: USER_A, serviceId: SERVICE_CORTE, startsAt: aStart });
    const bookingB = await seedBooking({ userId: USER_B, serviceId: SERVICE_CORTE, startsAt: bStart });

    const results = await Promise.all([
      rescheduleBookingForUser({ userId: USER_A, bookingId: bookingA, serviceId: SERVICE_CORTE, startsAt: target }),
      rescheduleBookingForUser({ userId: USER_B, bookingId: bookingB, serviceId: SERVICE_CORTE, startsAt: target }),
    ]);

    const successes = results.filter((r) => r.ok).length;
    const unavailable = results.filter((r) => !r.ok && r.reason === "slot_unavailable").length;
    expect(successes).toBe(1);
    expect(unavailable).toBe(1);

    // Exatamente um booking no alvo; nenhum perdido (ambos seguem ACTIVE).
    const atTarget = await prisma.booking.count({ where: { status: "ACTIVE", startsAt: target } });
    expect(atTarget).toBe(1);
    const activeTotal = await prisma.booking.count({
      where: { status: "ACTIVE", userId: { in: [USER_A, USER_B] } },
    });
    expect(activeTotal).toBe(2);

    // O que falhou permanece no horário original (integridade — FR-009).
    if (!results[0].ok) {
      const a = await prisma.booking.findUniqueOrThrow({ where: { id: bookingA } });
      expect(a.startsAt.toISOString()).toBe(aStart.toISOString());
    } else {
      const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingB } });
      expect(b.startsAt.toISOString()).toBe(bStart.toISOString());
    }
  });
});
