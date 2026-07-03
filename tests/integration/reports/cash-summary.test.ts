import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { getCashSummaryForOwner } from "@/server/ledger/cash-summary";
import { BUSINESS_ID, SP, slotAt, seedLedgerEntry, upsertUsers, cleanupLedgerAndBookings } from "./fixtures";

// Integração (Postgres) do caixa + breakdown (US1/US2). Bucketização por range em UTC no fuso da
// barbearia (FR-003), só ativos (FR-004), zeros em período vazio (FR-005), saldo podendo ser negativo
// (FR-006), breakdown com baldes null (FR-007/008) e soma dos baldes == total (FR-009/SC-004).
const OWNER_ID = "u-it-cash-owner";
const D = (v: string) => new Prisma.Decimal(v);

function bucket<T extends { key: unknown; amount: Prisma.Decimal }>(list: T[], key: unknown) {
  return list.find((b) => b.key === key);
}

beforeAll(async () => {
  await upsertUsers([{ id: OWNER_ID, email: "cash-owner@example.com", role: "OWNER" }]);
});

afterEach(async () => {
  await cleanupLedgerAndBookings([OWNER_ID]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID]);
  await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

/** Semeia o dataset de julho/2031: income 95.15, expense 120.30, saldo -25.15; inclui 1 inativo. */
async function seedJuly() {
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "40.10", occurredAt: slotAt("2031-07-10", 600), paymentMethod: "CASH" });
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "BOOKING", amount: "30.05", occurredAt: slotAt("2031-07-11", 600), paymentMethod: "PIX" });
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "25.00", occurredAt: slotAt("2031-07-12", 600), paymentMethod: null });
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "EXPENSE", origin: "EXPENSE", amount: "100.00", occurredAt: slotAt("2031-07-05", 600), category: "aluguel" });
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "EXPENSE", origin: "EXPENSE", amount: "20.30", occurredAt: slotAt("2031-07-06", 600), category: null });
  // Inativo: NÃO deve entrar em nada.
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "999.00", occurredAt: slotAt("2031-07-07", 600), paymentMethod: "CASH", isActive: false });
}

describe("getCashSummaryForOwner — totais e saldo (US1)", () => {
  it("totais, saldo negativo e exclusão de inativo (mês julho/2031)", async () => {
    await seedJuly();
    const r = await getCashSummaryForOwner({
      businessId: BUSINESS_ID,
      timeZone: SP,
      granularity: "month",
      referenceLocalDate: "2031-07-15",
    });
    expect(r.income.equals(D("95.15"))).toBe(true); // 40.10 + 30.05 + 25.00 (inativo 999 fora — SC-002)
    expect(r.expense.equals(D("120.30"))).toBe(true); // 100.00 + 20.30
    expect(r.balance.equals(D("-25.15"))).toBe(true); // saldo negativo (FR-006)
  });

  it("período vazio → 0.00 em tudo, listas vazias, sem erro (SC-005)", async () => {
    const r = await getCashSummaryForOwner({
      businessId: BUSINESS_ID,
      timeZone: SP,
      granularity: "month",
      referenceLocalDate: "2031-03-15",
    });
    expect(r.income.equals(D("0"))).toBe(true);
    expect(r.expense.equals(D("0"))).toBe(true);
    expect(r.balance.equals(D("0"))).toBe(true);
    expect(r.incomeByPaymentMethod).toHaveLength(0);
    expect(r.expenseByCategory).toHaveLength(0);
  });
});

describe("getCashSummaryForOwner — breakdown (US2)", () => {
  it("por forma (null→UNSET) e por categoria (null preservado); soma dos baldes == total (SC-004)", async () => {
    await seedJuly();
    const r = await getCashSummaryForOwner({
      businessId: BUSINESS_ID,
      timeZone: SP,
      granularity: "month",
      referenceLocalDate: "2031-07-15",
    });

    expect(bucket(r.incomeByPaymentMethod, "CASH")!.amount.equals(D("40.10"))).toBe(true);
    expect(bucket(r.incomeByPaymentMethod, "PIX")!.amount.equals(D("30.05"))).toBe(true);
    expect(bucket(r.incomeByPaymentMethod, "UNSET")!.amount.equals(D("25.00"))).toBe(true);
    expect(bucket(r.expenseByCategory, "aluguel")!.amount.equals(D("100.00"))).toBe(true);
    expect(bucket(r.expenseByCategory, null)!.amount.equals(D("20.30"))).toBe(true);

    const sumPm = r.incomeByPaymentMethod.reduce((a, b) => a.plus(b.amount), new Prisma.Decimal(0));
    const sumCat = r.expenseByCategory.reduce((a, b) => a.plus(b.amount), new Prisma.Decimal(0));
    expect(sumPm.equals(r.income)).toBe(true);
    expect(sumCat.equals(r.expense)).toBe(true);
  });
});

describe("getCashSummaryForOwner — borda de fuso nas 4 granularidades (SC-003)", () => {
  it("22:30 local de 13/07 (= 2031-07-14T01:30Z) conta em 13/07, não em 14/07", async () => {
    const occurredAt = new Date("2031-07-14T01:30:00.000Z"); // 22:30 de 13/07 em SP
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "50.00", occurredAt, paymentMethod: "CARD" });
    const shopId = BUSINESS_ID;

    for (const granularity of ["day", "week", "month", "year"] as const) {
      const inPeriod = await getCashSummaryForOwner({ businessId: shopId, timeZone: SP, granularity, referenceLocalDate: "2031-07-13" });
      expect(inPeriod.income.equals(D("50.00"))).toBe(true);
    }
    // Dia seguinte (14/07 local) NÃO contém o lançamento.
    const nextDay = await getCashSummaryForOwner({ businessId: shopId, timeZone: SP, granularity: "day", referenceLocalDate: "2031-07-14" });
    expect(nextDay.income.equals(D("0"))).toBe(true);
  });
});
