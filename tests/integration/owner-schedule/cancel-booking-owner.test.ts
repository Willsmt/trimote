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
import { getAvailableSlots } from "@/server/actions/get-available-slots";
import {
  SERVICE_CORTE,
  seedBooking,
  slotAt,
  upsertUsers,
  cleanupLedgerAndBookings,
  BUSINESS_ID,
  ensureOwnerMembership,
} from "../ledger/fixtures";

/**
 * Integração (Postgres) do cancelamento pelo DONO (issue #25). Caso NOVO de autorização: no Booking,
 * `userId` é o CLIENTE que agendou — o core existente (cancelBookingForUser) recusaria o dono com
 * not_owner. O core novo autoriza por ESCOPO DE NEGÓCIO: resolve por findFirst { id, businessId }
 * (cross-tenant → not_found, sem oráculo — padrão da #6). Mesma máquina de estados do cliente
 * (already_cancelled / already_completed), SEM janela de tempo (decisão: simetria) e SEM tocar o
 * ledger. Libera o horário automaticamente (exclusion constraint parcial em ACTIVE).
 *
 * TEST-FIRST (RED): core (função irmã em módulo existente) e action AINDA NÃO EXISTEM. Imports
 * dinâmicos DENTRO dos casos — cada um falha individualmente sem derrubar a coleta do arquivo.
 * O commit GREEN promove para imports estáticos no topo.
 */
async function coreCancel() {
  const mod = await import("@/server/booking/cancel-booking");
  return mod.cancelBookingForOwner;
}
async function actionCancel() {
  const mod = await import("@/server/actions/cancel-booking-owner");
  return mod.cancelBookingByOwner;
}

const OWNER_ID = "u-it-cbo-owner";
const CLIENT_ID = "u-it-cbo-client";
const DATE = "2026-12-04"; // sexta-feira (expediente no seed); dia exclusivo deste arquivo

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "cbo-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "cbo-client@example.com", role: "CLIENT" },
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

describe("cancelBookingForOwner (core)", () => {
  it("dono cancela booking ACTIVE do seu negocio: CANCELLED + cancelledAt e horario LIBERADO", async () => {
    const cancel = await coreCancel();
    const startsAt = slotAt(DATE, 10 * 60);
    const bookingId = await seedBooking({ userId: CLIENT_ID, serviceId: SERVICE_CORTE, startsAt });

    // Antes: o horário do booking está ocupado (não aparece na disponibilidade).
    const before = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE });
    if (!before.ok) throw new Error("disponibilidade falhou");
    expect(before.slots).not.toContain(startsAt.toISOString());

    const result = await cancel({ businessId: BUSINESS_ID, bookingId });
    expect(result).toEqual({ ok: true });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledAt).not.toBeNull();

    // Depois: cancelar libera o intervalo para outro cliente (espelho do FR-013 do cliente).
    const after = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE });
    if (!after.ok) throw new Error("disponibilidade falhou");
    expect(after.slots).toContain(startsAt.toISOString());
  });

  it("cancelamento NAO toca o ledger: nenhum lancamento criado nem inativado", async () => {
    const cancel = await coreCancel();
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 11 * 60),
    });

    const result = await cancel({ businessId: BUSINESS_ID, bookingId });
    expect(result).toEqual({ ok: true });

    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });

  it("estados terminais recusados: already_cancelled e already_completed (COMPLETED nao vira CANCELLED)", async () => {
    const cancel = await coreCancel();
    const cancelled = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 14 * 60),
      status: "CANCELLED",
    });
    const completed = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 15 * 60),
      status: "COMPLETED",
    });

    expect(await cancel({ businessId: BUSINESS_ID, bookingId: cancelled })).toEqual({
      ok: false,
      reason: "already_cancelled",
    });
    expect(await cancel({ businessId: BUSINESS_ID, bookingId: completed })).toEqual({
      ok: false,
      reason: "already_completed",
    });

    // O histórico concluído é intocável — nunca regride para CANCELLED.
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: completed } });
    expect(after.status).toBe("COMPLETED");
    expect(after.cancelledAt).toBeNull();
  });

  it("booking inexistente -> not_found", async () => {
    const cancel = await coreCancel();
    const result = await cancel({ businessId: BUSINESS_ID, bookingId: "booking-does-not-exist" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("cancelBookingByOwner (Server Action) — autorizacao por role", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    const cancelAction = await actionCancel();
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 16 * 60),
    });

    actAs(CLIENT_ID);
    await expect(cancelAction({ bookingId })).rejects.toBeInstanceOf(ForbiddenError);
    // A recusa não alterou nada.
    const mid = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(mid.status).toBe("ACTIVE");

    actAs(OWNER_ID);
    await expect(cancelAction({ bookingId })).resolves.toEqual({ ok: true });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.status).toBe("CANCELLED");
  });
});
