import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Mock de sessão (padrão lockdown) — só afeta a Server Action; o core roda com ownerId explícito.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

import { prisma } from "@/server/db/client";
import { ForbiddenError } from "@/server/auth/owner";
import { registerExpenseForOwner } from "@/server/ledger/register-expense";
import { registerExpense } from "@/server/actions/register-expense";
import { upsertUsers, cleanupLedgerAndBookings, BUSINESS_ID, ensureOwnerMembership } from "./fixtures";

// Integração (Postgres) da despesa (US4): EXPENSE/EXPENSE sem itens e sem cliente, paymentMethod,
// occurredAt e recusa de valor (FR-010/011/012/013/017, SC-007/SC-009).
const OWNER_ID = "u-it-exp-owner";
const CLIENT_ID = "u-it-exp-client";
const D = (v: string) => new Prisma.Decimal(v);

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "exp-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "exp-client@example.com", role: "CLIENT" },
  ]);
  await ensureOwnerMembership(OWNER_ID);
});

afterEach(async () => {
  actAs(null);
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("registerExpenseForOwner (core)", () => {
  it("EXPENSE/EXPENSE sem itens e sem cliente (SC-007)", async () => {
    const result = await registerExpenseForOwner({
      businessId: BUSINESS_ID, ownerId: OWNER_ID,
      amount: 100,
      description: "Aluguel",
      category: "fixo",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    expect(entry.type).toBe("EXPENSE");
    expect(entry.origin).toBe("EXPENSE");
    expect(entry.items).toHaveLength(0);
    expect(entry.clientId).toBeNull();
    expect(entry.clientName).toBeNull();
    expect(entry.bookingId).toBeNull();
    expect(entry.category).toBe("fixo");
    expect(entry.createdBy).toBe(OWNER_ID);
    expect(D(entry.amount.toString()).equals(D("100.00"))).toBe(true);
  });

  it("occurredAt e paymentMethod persistidos como informados, sem inferir origin (FR-012/013/017)", async () => {
    const occurredAt = new Date("2026-03-05T18:30:00.000Z");
    const withPm = await registerExpenseForOwner({
      businessId: BUSINESS_ID, ownerId: OWNER_ID,
      amount: 50,
      description: "Produtos",
      occurredAt,
      paymentMethod: "CARD",
    });
    expect(withPm.ok).toBe(true);
    if (withPm.ok) {
      const e = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: withPm.ledgerEntryId } });
      expect(e.occurredAt.toISOString()).toBe(occurredAt.toISOString());
      expect(e.paymentMethod).toBe("CARD");
      expect(e.origin).toBe("EXPENSE");
    }

    const withoutPm = await registerExpenseForOwner({
      businessId: BUSINESS_ID, ownerId: OWNER_ID,
      amount: 20,
      description: "Cafe",
    });
    expect(withoutPm.ok).toBe(true);
    if (withoutPm.ok) {
      const e = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: withoutPm.ledgerEntryId } });
      expect(e.paymentMethod).toBeNull();
    }
  });

  it("amount <= 0 -> invalid_amount (zero e negativo)", async () => {
    const zero = await registerExpenseForOwner({ businessId: BUSINESS_ID, ownerId: OWNER_ID, amount: 0, description: "x" });
    expect(zero).toEqual({ ok: false, reason: "invalid_amount" });
    const neg = await registerExpenseForOwner({ businessId: BUSINESS_ID, ownerId: OWNER_ID, amount: -5, description: "x" });
    expect(neg).toEqual({ ok: false, reason: "invalid_amount" });
  });

  it("description vazia -> invalid_description", async () => {
    const result = await registerExpenseForOwner({ businessId: BUSINESS_ID, ownerId: OWNER_ID, amount: 100, description: "" });
    expect(result).toEqual({ ok: false, reason: "invalid_description" });
  });

  it("description so com espacos -> invalid_description", async () => {
    const result = await registerExpenseForOwner({ businessId: BUSINESS_ID, ownerId: OWNER_ID, amount: 100, description: "   " });
    expect(result).toEqual({ ok: false, reason: "invalid_description" });
  });

  it("description valida com espacos nas pontas -> persiste com trim", async () => {
    const result = await registerExpenseForOwner({
      businessId: BUSINESS_ID, ownerId: OWNER_ID,
      amount: 100,
      description: "  Aluguel  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } });
    expect(entry.description).toBe("Aluguel");
  });
});

describe("registerExpense (Server Action) — autorizacao por role (SC-009)", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    actAs(CLIENT_ID);
    await expect(
      registerExpense({ amount: 100, description: "Aluguel" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(
      registerExpense({ amount: 100, description: "Aluguel" }),
    ).resolves.toMatchObject({ ok: true });
  });
});
