import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

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
import {
  SERVICE_CORTE,
  seedBooking,
  slotAt,
  upsertUsers,
  cleanupLedgerAndBookings,
  BUSINESS_ID,
  ensureOwnerMembership,
} from "./fixtures";

/**
 * Integração (Postgres) da duplicação de lançamento inativado (issue #11). Desfazer uma inativação
 * acidental = criar um lançamento NOVO copiando o inativado (fato novo no razão) — o original nunca
 * reativa (imutabilidade + trilha do soft delete). Guardas: só INATIVO é duplicável; origin BOOKING
 * recusa se já houver outro lançamento ATIVO do mesmo booking (invariante D10: 1 ativo + N inativos).
 *
 * TEST-FIRST (RED): o core e a action AINDA NÃO EXISTEM. Imports dinâmicos DENTRO dos casos fazem
 * cada um falhar individualmente (module not found) sem derrubar a coleta do arquivo — RED legível
 * caso a caso. O commit GREEN promove para imports estáticos no topo.
 */
async function coreDuplicate() {
  const mod = await import("@/server/ledger/duplicate-ledger-entry");
  return mod.duplicateLedgerEntryForOwner;
}
async function actionDuplicate() {
  const mod = await import("@/server/actions/duplicate-ledger-entry");
  return mod.duplicateLedgerEntry;
}

const OWNER_ID = "u-it-dup-owner";
const OWNER2_ID = "u-it-dup-owner2"; // autor do lançamento ORIGINAL (createdBy não deve ser copiado)
const CLIENT_ID = "u-it-dup-client";
const DATE = "2026-12-11"; // sexta-feira (expediente no seed); dia exclusivo deste arquivo
const SERVICE_DUP = "service-dup-011"; // serviço PRÓPRIO do arquivo: o preço muda no meio do caso 1
const D = (v: string) => new Prisma.Decimal(v);

function actAs(userId: string | null) {
  mockState.userId = userId;
}

/** Walk-in inativado (caminho comum dos casos): 1 item de serviço + 1 manual, PIX, cliente nomeado. */
async function newInactiveWalkInId(): Promise<string> {
  const result = await registerWalkInForOwner({
    businessId: BUSINESS_ID,
    ownerId: OWNER_ID,
    items: [
      { serviceId: SERVICE_DUP, description: "" },
      { description: "Pomada", amount: 15 },
    ],
    occurredAt: slotAt(DATE, 10 * 60),
    paymentMethod: "PIX",
    clientName: "Fulano",
  });
  if (!result.ok) throw new Error(`setup walk-in falhou: ${result.reason}`);
  const off = await deactivateLedgerEntryForOwner({
    businessId: BUSINESS_ID,
    ledgerEntryId: result.ledgerEntryId,
  });
  if (!off.ok) throw new Error(`setup inativação falhou: ${off.reason}`);
  return result.ledgerEntryId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "dup-owner@example.com", role: "OWNER" },
    { id: OWNER2_ID, email: "dup-owner2@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "dup-client@example.com", role: "CLIENT" },
  ]);
  await ensureOwnerMembership(OWNER_ID);
  await prisma.service.upsert({
    where: { id: SERVICE_DUP },
    update: { price: D("25.00"), isActive: true },
    create: {
      id: SERVICE_DUP,
      businessId: BUSINESS_ID,
      name: "Corte Dup 011",
      price: D("25.00"),
      durationMinutes: 30,
    },
  });
});

afterEach(async () => {
  actAs(null);
  await cleanupLedgerAndBookings([OWNER_ID, OWNER2_ID, CLIENT_ID]);
  // Restaura o preço do serviço próprio (o caso 1 o altera para provar o snapshot).
  await prisma.service.update({ where: { id: SERVICE_DUP }, data: { price: D("25.00") } });
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, OWNER2_ID, CLIENT_ID]);
  await prisma.service.delete({ where: { id: SERVICE_DUP } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, OWNER2_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("duplicateLedgerEntryForOwner (core)", () => {
  it("duplica walk-in inativado copiando campos, occurredAt e itens com o snapshot ORIGINAL", async () => {
    const duplicate = await coreDuplicate();
    const originalId = await newInactiveWalkInId();

    // Preço do serviço muda ANTES da duplicação: a duplicata deve manter o snapshot do original
    // (25.00), nunca re-snapshotar o catálogo atual (99.00) — repõe o MESMO fato econômico.
    await prisma.service.update({ where: { id: SERVICE_DUP }, data: { price: D("99.00") } });

    const result = await duplicate({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      ledgerEntryId: originalId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ledgerEntryId).not.toBe(originalId);

    const original = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: originalId } });
    const dup = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });

    // Campos copiados verbatim.
    expect(dup.type).toBe("INCOME");
    expect(dup.origin).toBe("WALK_IN");
    expect(dup.amount.equals(D("40.00"))).toBe(true); // 25 (snapshot) + 15 (manual)
    expect(dup.description).toBe("Atendimento avulso — Fulano");
    expect(dup.paymentMethod).toBe("PIX");
    expect(dup.clientId).toBeNull();
    expect(dup.clientName).toBe("Fulano");
    expect(dup.bookingId).toBeNull();
    // occurredAt COPIADO (decisão de produto): o fato econômico pertence à data original.
    expect(dup.occurredAt.getTime()).toBe(slotAt(DATE, 10 * 60).getTime());

    // Itens copiados com os amounts do ORIGINAL (25.00, não 99.00).
    expect(dup.items).toHaveLength(2);
    const svcItem = dup.items.find((i) => i.serviceId === SERVICE_DUP);
    const manualItem = dup.items.find((i) => i.serviceId === null);
    expect(svcItem).toBeDefined();
    expect(svcItem!.amount.equals(D("25.00"))).toBe(true);
    expect(manualItem).toBeDefined();
    expect(manualItem!.amount.equals(D("15.00"))).toBe(true);
    expect(manualItem!.description).toBe("Pomada");

    // Duplicata ativa; original permanece inativo e intocado.
    expect(dup.isActive).toBe(true);
    expect(original.isActive).toBe(false);
  });

  it("NAO copia os proibidos: externalRef null, createdBy do duplicador, isActive true", async () => {
    const duplicate = await coreDuplicate();
    const occurredAt = slotAt(DATE, 11 * 60);
    // Original inativo de OUTRO autor (OWNER2), com externalRef de pagamento e categoria.
    const original = await prisma.ledgerEntry.create({
      data: {
        businessId: BUSINESS_ID,
        type: "EXPENSE",
        origin: "EXPENSE",
        amount: D("80.00"),
        occurredAt,
        description: "Insumos da semana",
        category: "insumos",
        paymentMethod: "CARD",
        externalRef: "pay-ext-123",
        createdBy: OWNER2_ID,
        isActive: false,
      },
      select: { id: true, createdAt: true },
    });

    const result = await duplicate({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      ledgerEntryId: original.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dup = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } });
    expect(dup.externalRef).toBeNull(); // referência do pagamento ORIGINAL — nunca copiada
    expect(dup.createdBy).toBe(OWNER_ID); // auditoria NOVA: quem duplicou, não o autor original
    expect(dup.isActive).toBe(true);
    expect(dup.category).toBe("insumos"); // categoria é copiável
    expect(dup.occurredAt.getTime()).toBe(occurredAt.getTime());

    // Original intocado (externalRef e autoria preservados).
    const after = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: original.id } });
    expect(after.externalRef).toBe("pay-ext-123");
    expect(after.createdBy).toBe(OWNER2_ID);
    expect(after.isActive).toBe(false);
  });

  it("duplicar lancamento ATIVO -> entry_not_inactive; nada criado", async () => {
    const duplicate = await coreDuplicate();
    const active = await registerWalkInForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      items: [{ description: "Avulso ativo", amount: 10 }],
    });
    if (!active.ok) throw new Error("setup falhou");

    const result = await duplicate({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      ledgerEntryId: active.ledgerEntryId,
    });
    expect(result).toEqual({ ok: false, reason: "entry_not_inactive" });
    expect(await prisma.ledgerEntry.count({ where: { createdBy: OWNER_ID } })).toBe(1);
  });

  it("lancamento inexistente -> entry_not_found", async () => {
    const duplicate = await coreDuplicate();
    const result = await duplicate({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      ledgerEntryId: "entry-does-not-exist",
    });
    expect(result).toEqual({ ok: false, reason: "entry_not_found" });
  });

  it("BOOKING: duplica inativado preservando bookingId; nova duplicacao -> booking_already_captured", async () => {
    const duplicate = await coreDuplicate();
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 14 * 60),
    });
    const completed = await completeBookingForOwner({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      bookingId,
    });
    if (!completed.ok) throw new Error("setup conclusão falhou");
    await deactivateLedgerEntryForOwner({
      businessId: BUSINESS_ID,
      ledgerEntryId: completed.ledgerEntryId,
    });

    // Duplicação repõe a receita do booking (o que completeBooking recusaria: already_completed).
    const first = await duplicate({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      ledgerEntryId: completed.ledgerEntryId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const dup = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: first.ledgerEntryId } });
    expect(dup.origin).toBe("BOOKING");
    expect(dup.bookingId).toBe(bookingId);
    expect(dup.clientId).toBe(CLIENT_ID);
    expect(dup.isActive).toBe(true);

    // O booking não é tocado (a duplicação é só razão — não há dupla transição de estado).
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("COMPLETED");

    // Guarda D10: já existe lançamento ATIVO do mesmo booking -> segunda duplicação recusada.
    const second = await duplicate({
      businessId: BUSINESS_ID,
      ownerId: OWNER_ID,
      ledgerEntryId: completed.ledgerEntryId,
    });
    expect(second).toEqual({ ok: false, reason: "booking_already_captured" });
    expect(await prisma.ledgerEntry.count({ where: { bookingId, isActive: true } })).toBe(1);
  });
});

describe("duplicateLedgerEntry (Server Action) — autorizacao por role", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    const duplicateAction = await actionDuplicate();
    const originalId = await newInactiveWalkInId();

    actAs(CLIENT_ID);
    await expect(duplicateAction({ ledgerEntryId: originalId })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    actAs(OWNER_ID);
    const result = await duplicateAction({ ledgerEntryId: originalId });
    expect(result.ok).toBe(true);
  });
});
