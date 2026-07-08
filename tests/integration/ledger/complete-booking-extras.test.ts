import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { completeBookingForOwner } from "@/server/ledger/complete-booking";
import {
  BUSINESS_ID,
  SERVICE_CORTE,
  SERVICE_BARBA,
  seedBooking,
  slotAt,
  upsertUsers,
  cleanupLedgerAndBookings,
} from "./fixtures";

// Integração (Postgres) dos EXTRAS na conclusão (US2): item de serviço (snapshot) + item manual;
// total == soma dos itens validado na transação; recusas de valor/serviço (FR-006/FR-007/FR-011/SC-005).
const OWNER_ID = "u-it-cbx-owner";
const CLIENT_ID = "u-it-cbx-client";
const DATE = "2026-12-30"; // quarta-feira (expediente no seed)
const D = (v: string) => new Prisma.Decimal(v);

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "cbx-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "cbx-client@example.com", role: "CLIENT" },
  ]);
});

afterEach(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("completeBookingForOwner — extras (US2)", () => {
  it("conclui com extra de servico (snapshot) + extra manual; amount == soma dos itens (SC-005)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE, // 40.00
      startsAt: slotAt(DATE, 10 * 60),
    });

    const result = await completeBookingForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      bookingId,
      extras: [
        { serviceId: SERVICE_BARBA, description: "Barba" }, // snapshot 30.00
        { description: "Gorjeta", amount: 10 }, // manual 10.00
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    expect(entry.items).toHaveLength(3);
    expect(D(entry.amount.toString()).equals(D("80.00"))).toBe(true); // 40 + 30 + 10

    const base = entry.items.find((i) => i.serviceId === SERVICE_CORTE);
    const barba = entry.items.find((i) => i.serviceId === SERVICE_BARBA);
    const manual = entry.items.find((i) => i.serviceId === null);
    expect(D(base!.amount.toString()).equals(D("40.00"))).toBe(true);
    expect(D(barba!.amount.toString()).equals(D("30.00"))).toBe(true);
    expect(manual!.description).toBe("Gorjeta");
    expect(D(manual!.amount.toString()).equals(D("10.00"))).toBe(true);
  });

  it("extra manual com amount <= 0 -> invalid_amount, nada persiste", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 11 * 60),
    });

    const result = await completeBookingForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      bookingId,
      extras: [{ description: "Zero", amount: 0 }],
    });
    expect(result).toEqual({ ok: false, reason: "invalid_amount" });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("ACTIVE");
    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });

  it("extra manual com description so espacos -> invalid_description, nada persiste", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 13 * 60),
    });

    const result = await completeBookingForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      bookingId,
      extras: [{ description: "   ", amount: 10 }],
    });
    expect(result).toEqual({ ok: false, reason: "invalid_description" });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("ACTIVE");
    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });

  it("extra manual com description valida com espacos -> persiste com trim", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 14 * 60),
    });

    const result = await completeBookingForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      bookingId,
      extras: [{ description: "  Gorjeta  ", amount: 10 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    const manual = entry.items.find((i) => i.serviceId === null);
    expect(manual!.description).toBe("Gorjeta");
  });

  it("extra de servico inexistente -> service_not_found, nada persiste", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 12 * 60),
    });

    const result = await completeBookingForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      bookingId,
      extras: [{ serviceId: "service-does-not-exist", description: "Fantasma" }],
    });
    expect(result).toEqual({ ok: false, reason: "service_not_found" });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("ACTIVE");
    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });
});
