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
import { registerWalkInForOwner } from "@/server/ledger/register-walk-in";
import { registerWalkIn } from "@/server/actions/register-walk-in";
import { SERVICE_CORTE, SERVICE_BARBA, upsertUsers, cleanupLedgerAndBookings } from "./fixtures";

// Integração (Postgres) do atendimento avulso (US3): 3 modos de identificação, extras, sem tocar a
// agenda, occurredAt/paymentMethod e recusas (FR-006..009/012/013/017, SC-005/SC-006/SC-009).
const OWNER_ID = "u-it-wi-owner";
const CLIENT_ID = "u-it-wi-client";
const D = (v: string) => new Prisma.Decimal(v);

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "wi-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "wi-client@example.com", role: "CLIENT" },
  ]);
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

describe("registerWalkInForOwner (core)", () => {
  it("cliente cadastrado: INCOME/WALK_IN sem bookingId, vinculado ao clientId (SC-006)", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      clientId: CLIENT_ID,
      items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    expect(entry.type).toBe("INCOME");
    expect(entry.origin).toBe("WALK_IN");
    expect(entry.bookingId).toBeNull();
    expect(entry.clientId).toBe(CLIENT_ID);
    expect(entry.clientName).toBeNull();
    expect(entry.createdBy).toBe(OWNER_ID);
    expect(D(entry.amount.toString()).equals(D("40.00"))).toBe(true);
    expect(entry.items).toHaveLength(1);
  });

  it("nome livre: registra clientName sem clientId (SC-006)", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      clientName: "Fulano Avulso",
      items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } });
    expect(entry.clientId).toBeNull();
    expect(entry.clientName).toBe("Fulano Avulso");
  });

  it("anonimo: sem clientId e sem clientName (SC-006)", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } });
    expect(entry.clientId).toBeNull();
    expect(entry.clientName).toBeNull();
  });

  it("nao toca a agenda: nenhum Booking e criado (SC-006)", async () => {
    await registerWalkInForOwner({
      ownerId: OWNER_ID,
      clientId: CLIENT_ID,
      items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
    });
    expect(await prisma.booking.count({ where: { userId: CLIENT_ID } })).toBe(0);
  });

  it("extras: item de servico (snapshot) + item manual; amount == soma (SC-005)", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      items: [
        { serviceId: SERVICE_CORTE, description: "Corte" }, // 40.00
        { serviceId: SERVICE_BARBA, description: "Barba" }, // 30.00
        { description: "Produto", amount: 25 }, // manual 25.00
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    expect(entry.items).toHaveLength(3);
    expect(D(entry.amount.toString()).equals(D("95.00"))).toBe(true);
  });

  it("occurredAt e paymentMethod: persistidos como informados, sem inferir origin (FR-012/013/017)", async () => {
    const occurredAt = new Date("2026-02-10T09:00:00.000Z");
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
      occurredAt,
      paymentMethod: "CASH",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } });
    expect(entry.occurredAt.toISOString()).toBe(occurredAt.toISOString());
    expect(entry.paymentMethod).toBe("CASH");
    expect(entry.origin).toBe("WALK_IN");
  });

  it("sem itens -> no_items", async () => {
    const result = await registerWalkInForOwner({ ownerId: OWNER_ID, items: [] });
    expect(result).toEqual({ ok: false, reason: "no_items" });
  });

  it("item manual com amount <= 0 -> invalid_amount", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      items: [{ description: "Zero", amount: 0 }],
    });
    expect(result).toEqual({ ok: false, reason: "invalid_amount" });
  });

  it("item de servico inexistente -> service_not_found", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      items: [{ serviceId: "nope", description: "Fantasma" }],
    });
    expect(result).toEqual({ ok: false, reason: "service_not_found" });
  });

  it("clientId inexistente -> client_not_found", async () => {
    const result = await registerWalkInForOwner({
      ownerId: OWNER_ID,
      clientId: "client-does-not-exist",
      items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
    });
    expect(result).toEqual({ ok: false, reason: "client_not_found" });
  });
});

describe("registerWalkIn (Server Action) — autorizacao por role (SC-009)", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    actAs(CLIENT_ID);
    await expect(
      registerWalkIn({ items: [{ serviceId: SERVICE_CORTE, description: "Corte" }] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(
      registerWalkIn({ items: [{ serviceId: SERVICE_CORTE, description: "Corte" }] }),
    ).resolves.toMatchObject({ ok: true });
  });
});
