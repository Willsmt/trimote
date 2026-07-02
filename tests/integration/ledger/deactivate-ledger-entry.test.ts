import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

// Mock de sessão (padrão lockdown) — só afeta a Server Action; o core roda direto.
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
import { completeBookingForOwner } from "@/server/ledger/complete-booking";
import { registerWalkInForOwner } from "@/server/ledger/register-walk-in";
import { deactivateLedgerEntryForOwner } from "@/server/ledger/deactivate-ledger-entry";
import { deactivateLedgerEntry } from "@/server/actions/deactivate-ledger-entry";
import { SERVICE_CORTE, seedBooking, slotAt, upsertUsers, cleanupLedgerAndBookings } from "./fixtures";

// Integração (Postgres) do soft delete (US5): correção sem apagar, sem reabrir booking, idempotência
// e autorização (FR-015/FR-016, SC-008/SC-009).
const OWNER_ID = "u-it-del-owner";
const CLIENT_ID = "u-it-del-client";
const DATE = "2026-12-31"; // quinta-feira (expediente no seed)

function actAs(userId: string | null) {
  mockState.userId = userId;
}

async function newWalkInEntryId(): Promise<string> {
  const result = await registerWalkInForOwner({
    ownerId: OWNER_ID,
    items: [{ serviceId: SERVICE_CORTE, description: "Corte" }],
  });
  if (!result.ok) throw new Error(`setup walk-in falhou: ${result.reason}`);
  return result.ledgerEntryId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "del-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "del-client@example.com", role: "CLIENT" },
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

describe("deactivateLedgerEntryForOwner (core)", () => {
  it("soft delete: marca isActive=false e NAO apaga o registro (SC-008)", async () => {
    const entryId = await newWalkInEntryId();

    const result = await deactivateLedgerEntryForOwner({ ledgerEntryId: entryId });
    expect(result).toEqual({ ok: true });

    const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
    expect(entry).not.toBeNull(); // continua consultável (auditoria)
    expect(entry!.isActive).toBe(false);
  });

  it("inativar um lancamento de BOOKING nao desconclui o booking (FR-016)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 10 * 60),
    });
    const completed = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const result = await deactivateLedgerEntryForOwner({ ledgerEntryId: completed.ledgerEntryId });
    expect(result).toEqual({ ok: true });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("COMPLETED"); // NAO reabre
  });

  it("inativar duas vezes -> already_inactive", async () => {
    const entryId = await newWalkInEntryId();
    await deactivateLedgerEntryForOwner({ ledgerEntryId: entryId });
    const second = await deactivateLedgerEntryForOwner({ ledgerEntryId: entryId });
    expect(second).toEqual({ ok: false, reason: "already_inactive" });
  });

  it("lancamento inexistente -> entry_not_found", async () => {
    const result = await deactivateLedgerEntryForOwner({ ledgerEntryId: "entry-does-not-exist" });
    expect(result).toEqual({ ok: false, reason: "entry_not_found" });
  });
});

describe("deactivateLedgerEntry (Server Action) — autorizacao por role (SC-009)", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    const entryId = await newWalkInEntryId();

    actAs(CLIENT_ID);
    await expect(deactivateLedgerEntry({ ledgerEntryId: entryId })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    actAs(OWNER_ID);
    await expect(deactivateLedgerEntry({ ledgerEntryId: entryId })).resolves.toEqual({ ok: true });
  });
});
