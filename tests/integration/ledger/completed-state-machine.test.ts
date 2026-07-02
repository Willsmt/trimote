import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { rescheduleBookingForUser } from "@/server/booking/reschedule-booking";
import { cancelBookingForUser } from "@/server/booking/cancel-booking";
import { SERVICE_CORTE, seedBooking, slotAt, upsertUsers, cleanupLedgerAndBookings } from "./fixtures";

// Integração (Postgres) — máquina de estados: um booking COMPLETED é terminal. Remarcar e cancelar
// (F004) recusam com o MESMO reason distinto `already_completed` (FR-005/SC-004). Cobre o ponto de
// inserção nos dois padrões opostos: allowlist (reschedule) e denylist (cancel — bug latente).
const USER = "u-it-csm-client";
const DATE = "2026-12-29"; // terça-feira (expediente no seed)

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "csm-client@example.com" }]);
});

afterEach(async () => {
  await cleanupLedgerAndBookings([USER]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([USER]);
  await prisma.user.deleteMany({ where: { id: USER } });
  await prisma.$disconnect();
});

describe("booking COMPLETED e recusado com already_completed (FR-005)", () => {
  it("remarcar um COMPLETED -> already_completed, booking intacto (SC-004, allowlist reschedule)", async () => {
    const startsAt = slotAt(DATE, 10 * 60);
    const bookingId = await seedBooking({
      userId: USER,
      serviceId: SERVICE_CORTE,
      startsAt,
      status: "COMPLETED",
    });

    const now = slotAt(DATE, 8 * 60); // antes do horário: garante que a recusa vem do estado, não do tempo
    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 14 * 60),
      now,
    });

    expect(result).toEqual({ ok: false, reason: "already_completed" });

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.status).toBe("COMPLETED");
    expect(row.startsAt.toISOString()).toBe(startsAt.toISOString());
  });

  it("cancelar um COMPLETED -> already_completed e NAO vira CANCELLED (SC-004, denylist cancel)", async () => {
    const bookingId = await seedBooking({
      userId: USER,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 11 * 60),
      status: "COMPLETED",
    });

    const result = await cancelBookingForUser({ userId: USER, bookingId });

    expect(result).toEqual({ ok: false, reason: "already_completed" });

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.status).toBe("COMPLETED"); // regressão: NÃO foi cancelado
  });
});
