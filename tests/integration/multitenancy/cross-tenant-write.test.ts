import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Controla o usuario "logado" via mock da camada de sessao (vi.hoisted evita TDZ no factory),
// mesmo padrao de lockdown/anti-escalation. requireOwner deriva o negocio ativo do MEMBERSHIP:
// como o dono de A tem UM unico vinculo (a A), o negocio ativo resolve para A automaticamente.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

import { prisma } from "@/server/db/client";
import { updateService } from "@/server/actions/update-service";
import { deactivateService } from "@/server/actions/deactivate-service";
import { reactivateService } from "@/server/actions/reactivate-service";
import { deactivateLedgerEntry } from "@/server/actions/deactivate-ledger-entry";
import { duplicateLedgerEntry } from "@/server/actions/duplicate-ledger-entry";
import { completeBooking } from "@/server/actions/complete-booking";
import { registerWalkIn } from "@/server/actions/register-walk-in";
import {
  createTestBusiness,
  upsertUser,
  addMembership,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "./fixtures";
import { seedBooking } from "../ledger/fixtures";

// Integracao: ISOLAMENTO cross-tenant de ESCRITA (issue #6, pos-F007). requireOwner prova que voce e
// dono de ALGUM negocio ativo, mas nao que a ENTIDADE alcancada por ID pertence a ele. Sem RLS, um
// findUnique por id atinge qualquer tenant. Todos os casos: dono de A alcancando entidades de B.
const BIZ_A = "biz-xtw-a";
const BIZ_B = "biz-xtw-b";
const OWNER_A = "u-xtw-owner-a";
const OWNER_B = "u-xtw-owner-b";
const CLIENT_ID = "u-xtw-client";
const D = (v: string) => new Prisma.Decimal(v);

// Ids de entidade recriados a cada teste (estado fresco).
let svcA: string; // servico ATIVO de A (alvo do controle)
let svcB: string; // servico ATIVO de B
let svcBInactive: string; // servico INATIVO de B (alvo do reactivate)
let bookingA: string; // booking ACTIVE de A (base legitima do teste de extras)
let bookingB: string; // booking ACTIVE de B
let entryB: string; // LedgerEntry ativo de B

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUser({ id: OWNER_A, email: "xtw-owner-a@example.com", role: "OWNER" });
  await upsertUser({ id: OWNER_B, email: "xtw-owner-b@example.com", role: "OWNER" });
  await upsertUser({ id: CLIENT_ID, email: "xtw-client@example.com", role: "CLIENT" });
  await createTestBusiness({ id: BIZ_A, name: "XTW A", slug: "xtw-a" });
  await createTestBusiness({ id: BIZ_B, name: "XTW B", slug: "xtw-b" });
  // Cada dono tem UM unico vinculo OWNER -> negocio ativo auto-resolvido por requireOwner.
  await addMembership({ userId: OWNER_A, businessId: BIZ_A, createdBy: OWNER_A });
  await addMembership({ userId: OWNER_B, businessId: BIZ_B, createdBy: OWNER_B });
});

beforeEach(async () => {
  // Servico ativo em A (alvo do controle de caminho feliz).
  const sA = await prisma.service.create({
    data: { businessId: BIZ_A, name: "Corte A", price: D("40.00"), durationMinutes: 30, isActive: true },
    select: { id: true },
  });
  svcA = sA.id;
  // Servico ativo em B (alvo de update/deactivate cross-tenant e de item/extra cross-tenant).
  const sB = await prisma.service.create({
    data: { businessId: BIZ_B, name: "Corte B", price: D("50.00"), durationMinutes: 45, isActive: true },
    select: { id: true },
  });
  svcB = sB.id;
  // Servico INATIVO em B (alvo do reactivate cross-tenant).
  const sBi = await prisma.service.create({
    data: { businessId: BIZ_B, name: "Barba B", price: D("25.00"), durationMinutes: 20, isActive: false },
    select: { id: true },
  });
  svcBInactive = sBi.id;
  // Booking ACTIVE em A (base legitima para o teste de extras) e em B (alvo de completeBooking).
  const futureA = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const futureB = new Date(Date.now() + 8 * 24 * 60 * 60_000);
  bookingA = await seedBooking({ userId: CLIENT_ID, serviceId: svcA, startsAt: futureA });
  bookingB = await seedBooking({ userId: CLIENT_ID, serviceId: svcB, startsAt: futureB });
  // LedgerEntry ativo em B (alvo do deactivate cross-tenant).
  const e = await prisma.ledgerEntry.create({
    data: {
      businessId: BIZ_B,
      type: "INCOME",
      origin: "WALK_IN",
      amount: D("50.00"),
      occurredAt: new Date(),
      description: "Avulso B",
      createdBy: OWNER_B,
    },
    select: { id: true },
  });
  entryB = e.id;
  actAs(OWNER_A);
});

afterEach(async () => {
  actAs(null);
  await prisma.ledgerEntry.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
  await prisma.booking.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
  await prisma.service.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
});

afterAll(async () => {
  await cleanupMembershipsAndSessions([OWNER_A, OWNER_B, CLIENT_ID]);
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("isolamento cross-tenant de escrita (issue #6) — dono de A NAO alcanca entidades de B", () => {
  it("updateService com serviceId de B -> not_found; servico de B inalterado", async () => {
    const result = await updateService({ serviceId: svcB, name: "Hackeado", price: "1.00", durationMinutes: 5 });
    expect(result).toEqual({ ok: false, reason: "not_found" });

    const after = await prisma.service.findUniqueOrThrow({ where: { id: svcB } });
    expect(after.name).toBe("Corte B");
    expect(after.price.equals(D("50.00"))).toBe(true);
    expect(after.durationMinutes).toBe(45);
  });

  it("deactivateService com serviceId de B -> not_found; isActive continua true", async () => {
    const result = await deactivateService({ serviceId: svcB });
    expect(result).toEqual({ ok: false, reason: "not_found" });

    const after = await prisma.service.findUniqueOrThrow({ where: { id: svcB } });
    expect(after.isActive).toBe(true);
  });

  it("reactivateService com serviceId inativo de B -> not_found; continua inativo", async () => {
    const result = await reactivateService({ serviceId: svcBInactive });
    expect(result).toEqual({ ok: false, reason: "not_found" });

    const after = await prisma.service.findUniqueOrThrow({ where: { id: svcBInactive } });
    expect(after.isActive).toBe(false);
  });

  it("deactivateLedgerEntry com ledgerEntryId de B -> entry_not_found; isActive continua true", async () => {
    const result = await deactivateLedgerEntry({ ledgerEntryId: entryB });
    expect(result).toEqual({ ok: false, reason: "entry_not_found" });

    const after = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entryB } });
    expect(after.isActive).toBe(true);
  });

  it("duplicateLedgerEntry com lancamento INATIVO de B -> entry_not_found; nada criado", async () => {
    // Alvo cross-tenant no estado DUPLICAVEL (inativo): a recusa deve ser entry_not_found (barreira
    // de negocio ANTES do estado — nao vazar que a entidade de B existe), nunca entry_not_inactive.
    const inactiveB = await prisma.ledgerEntry.create({
      data: {
        businessId: BIZ_B,
        type: "INCOME",
        origin: "WALK_IN",
        amount: D("70.00"),
        occurredAt: new Date(),
        description: "Avulso B inativado",
        createdBy: OWNER_B,
        isActive: false,
      },
      select: { id: true },
    });
    const before = await prisma.ledgerEntry.count({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });

    const result = await duplicateLedgerEntry({ ledgerEntryId: inactiveB.id });
    expect(result).toEqual({ ok: false, reason: "entry_not_found" });

    expect(await prisma.ledgerEntry.count({ where: { businessId: { in: [BIZ_A, BIZ_B] } } })).toBe(before);
  });

  it("cancelBookingByOwner com bookingId de B -> not_found; booking de B segue ACTIVE", async () => {
    // RED (issue #25): import dinamico enquanto a action nao existe — nao derruba a coleta do
    // arquivo (os demais casos seguem verdes). O commit GREEN promove para import estatico no topo.
    const { cancelBookingByOwner } = await import("@/server/actions/cancel-booking-owner");

    const result = await cancelBookingByOwner({ bookingId: bookingB });
    expect(result).toEqual({ ok: false, reason: "not_found" });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingB } });
    expect(after.status).toBe("ACTIVE");
    expect(after.cancelledAt).toBeNull();
  });

  it("completeBooking com bookingId de B -> booking_not_found; booking ACTIVE e sem lancamento", async () => {
    const result = await completeBooking({ bookingId: bookingB });
    expect(result).toEqual({ ok: false, reason: "booking_not_found" });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingB } });
    expect(after.status).toBe("ACTIVE");
    expect(await prisma.ledgerEntry.count({ where: { bookingId: bookingB } })).toBe(0);
  });

  it("completeBooking com booking COMPLETED de B -> booking_not_found (NAO already_completed): trava o oraculo", async () => {
    // A barreira de negocio vem ANTES do check de status: um booking de B, mesmo ja concluido, e
    // indistinguivel de inexistente para o dono de A. `already_completed` aqui vazaria a existencia
    // (e o estado) de uma entidade alheia. Regressao contra reordenar a checagem.
    const completedB = await seedBooking({
      userId: CLIENT_ID,
      serviceId: svcB,
      startsAt: new Date(Date.now() + 9 * 24 * 60 * 60_000),
      status: "COMPLETED",
    });

    const result = await completeBooking({ bookingId: completedB });
    expect(result).toEqual({ ok: false, reason: "booking_not_found" });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: completedB } });
    expect(after.status).toBe("COMPLETED"); // inalterado
  });

  it("completeBooking (booking de A) com extra.serviceId de B -> service_not_found; A intacto, sem lancamento", async () => {
    const result = await completeBooking({
      bookingId: bookingA,
      extras: [{ serviceId: svcB, description: "extra alheio" }],
    });
    expect(result).toEqual({ ok: false, reason: "service_not_found" });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingA } });
    expect(after.status).toBe("ACTIVE");
    expect(await prisma.ledgerEntry.count({ where: { bookingId: bookingA } })).toBe(0);
  });

  it("registerWalkIn com item.serviceId de B -> service_not_found; nenhum lancamento em A", async () => {
    const result = await registerWalkIn({ items: [{ serviceId: svcB, description: "item alheio" }] });
    expect(result).toEqual({ ok: false, reason: "service_not_found" });

    expect(await prisma.ledgerEntry.count({ where: { businessId: BIZ_A } })).toBe(0);
  });

  it("CONTROLE: updateService do dono de A no proprio servico de A continua ok:true", async () => {
    const result = await updateService({ serviceId: svcA, price: "55.00" });
    expect(result).toEqual({ ok: true });

    const after = await prisma.service.findUniqueOrThrow({ where: { id: svcA } });
    expect(after.price.equals(D("55.00"))).toBe(true);
  });
});
