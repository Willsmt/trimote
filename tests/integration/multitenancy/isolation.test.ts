import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { getCashSummaryForOwner } from "@/server/ledger/cash-summary";
import { listLedgerForOwner } from "@/server/ledger/ledger-list";
import { createBookingForUser } from "@/server/booking/create-booking";
import { localDateTimeToUtc } from "@/domain/time";
import {
  createTestBusiness,
  upsertUser,
  cleanupBusinesses,
} from "./fixtures";

// Integração: ISOLAMENTO por negócio (US3, SC-001/SC-008) — a lógica crítica da multi-tenancy.
// Caixa/razão de A não somam/listam dados de B; booking de A e B no mesmo horário coexistem (a
// exclusion constraint particiona por businessId).
const CLIENT_ID = "u-iso-client";
const BIZ_A = "biz-iso-a";
const BIZ_B = "biz-iso-b";
const SVC_A = "svc-iso-a";
const SVC_B = "svc-iso-b";
const SP = "America/Sao_Paulo";
const D = (v: string) => new Prisma.Decimal(v);

async function seedBusinessWithService(bizId: string, slug: string, svcId: string) {
  await createTestBusiness({ id: bizId, name: bizId, slug });
  // expediente seg-sab 09-18 (weekday 3 = quarta, usado abaixo)
  for (const weekday of [1, 2, 3, 4, 5, 6]) {
    await prisma.openingHours.upsert({
      where: { businessId_weekday: { businessId: bizId, weekday } },
      update: {},
      create: { businessId: bizId, weekday, opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60 },
    });
  }
  await prisma.service.upsert({
    where: { id: svcId },
    update: {},
    create: { id: svcId, businessId: bizId, name: "Corte", price: D("40.00"), durationMinutes: 30 },
  });
}

beforeAll(async () => {
  await upsertUser({ id: CLIENT_ID, email: "iso-client@example.com", role: "CLIENT" });
  await seedBusinessWithService(BIZ_A, "iso-a", SVC_A);
  await seedBusinessWithService(BIZ_B, "iso-b", SVC_B);
});

afterEach(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
  await prisma.booking.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
});

afterAll(async () => {
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: CLIENT_ID } });
  await prisma.$disconnect();
});

describe("isolamento financeiro por negócio (US3, SC-001)", () => {
  it("caixa e razão de A não incluem lançamentos de B", async () => {
    // Lançamento em cada negócio (mês janeiro/2035, isolado no tempo).
    const at = localDateTimeToUtc("2035-01-10", 10 * 60, SP);
    await prisma.ledgerEntry.create({ data: { businessId: BIZ_A, type: "INCOME", origin: "WALK_IN", amount: D("100.00"), occurredAt: at, description: "A", createdBy: CLIENT_ID } });
    await prisma.ledgerEntry.create({ data: { businessId: BIZ_B, type: "INCOME", origin: "WALK_IN", amount: D("999.00"), occurredAt: at, description: "B", createdBy: CLIENT_ID } });

    const cashA = await getCashSummaryForOwner({ businessId: BIZ_A, timeZone: SP, granularity: "month", referenceLocalDate: "2035-01-15" });
    expect(cashA.income.equals(D("100.00"))).toBe(true); // NÃO soma os 999 de B

    const listA = await listLedgerForOwner({ businessId: BIZ_A, timeZone: SP, filter: { period: { granularity: "month", referenceLocalDate: "2035-01-15" } } });
    expect(listA.rows).toHaveLength(1);
    expect(listA.rows[0].description).toBe("A");
  });
});

describe("não-sobreposição particionada por negócio (US3, SC-008)", () => {
  it("booking de A e de B no MESMO horário coexistem (a exclusion constraint parte por businessId)", async () => {
    const slot = localDateTimeToUtc("2035-01-15", 10 * 60, SP); // segunda, dentro do expediente, futuro
    const a = await createBookingForUser({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: slot });
    const b = await createBookingForUser({ userId: CLIENT_ID, serviceId: SVC_B, startsAt: slot });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true); // não conflita: negócios diferentes
  });

  it("dois bookings no mesmo horário e MESMO negócio conflitam (slot_unavailable)", async () => {
    const slot = localDateTimeToUtc("2035-01-16", 11 * 60, SP); // terça
    const first = await createBookingForUser({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: slot });
    const second = await createBookingForUser({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: slot });
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "slot_unavailable" });
  });
});
