import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Controla o usuário "logado" via mock da camada de sessão (padrão do lockdown da 002).
// Afeta só as Server Actions (que passam por requireOwner → getCurrentUser); os testes de core
// chamam completeBookingForOwner diretamente com ownerId explícito e não dependem do mock.
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
import { completeBooking } from "@/server/actions/complete-booking";
import {
  BUSINESS_ID,
  SERVICE_CORTE,
  seedBooking,
  slotAt,
  upsertUsers,
  cleanupLedgerAndBookings,
} from "./fixtures";

// Integração (Postgres) da conclusão de atendimento (US1): snapshot, atomicidade, estado terminal,
// occurredAt, paymentMethod e autorização (SC-001/002/003/009, FR-001..004/012/013/017/019).
const OWNER_ID = "u-it-cb-owner";
const CLIENT_ID = "u-it-cb-client";
const DATE = "2026-12-28"; // segunda-feira (expediente no seed)
const SNAP_SERVICE_NAME = "ZZ005-cb-snapshot";
const D = (v: string) => new Prisma.Decimal(v);

let snapServiceId: string;

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "cb-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "cb-client@example.com", role: "CLIENT" },
  ]);
  const svc = await prisma.service.create({
    data: {
      businessId: BUSINESS_ID,
      name: SNAP_SERVICE_NAME,
      price: "50.00",
      durationMinutes: 30,
      isActive: true,
    },
    select: { id: true },
  });
  snapServiceId = svc.id;
});

afterEach(async () => {
  actAs(null);
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
  await prisma.service.delete({ where: { id: snapServiceId } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("completeBookingForOwner (core)", () => {
  it("sucesso: booking vira COMPLETED e gera LedgerEntry INCOME/BOOKING com item snapshot (SC-001)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 10 * 60),
    });

    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("COMPLETED");

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    expect(entry.type).toBe("INCOME");
    expect(entry.origin).toBe("BOOKING");
    expect(entry.bookingId).toBe(bookingId);
    expect(entry.clientId).toBe(CLIENT_ID); // cliente = quem agendou
    expect(entry.createdBy).toBe(OWNER_ID); // autor = OWNER
    expect(entry.isActive).toBe(true);
    expect(D(entry.amount.toString()).equals(D("40.00"))).toBe(true);
    expect(entry.items).toHaveLength(1);
    expect(entry.items[0].serviceId).toBe(SERVICE_CORTE);
    expect(D(entry.items[0].amount.toString()).equals(D("40.00"))).toBe(true);
  });

  it("booking inexistente -> booking_not_found", async () => {
    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId: "does-not-exist" });
    expect(result).toEqual({ ok: false, reason: "booking_not_found" });
  });

  it("concluir um booking ja COMPLETED -> already_completed, sem 2o lancamento (SC-003)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 11 * 60),
      status: "COMPLETED",
    });
    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId });
    expect(result).toEqual({ ok: false, reason: "already_completed" });
    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });

  it("concluir um booking CANCELLED -> booking_cancelled (sem lancamento)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 12 * 60),
      status: "CANCELLED",
    });
    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId });
    expect(result).toEqual({ ok: false, reason: "booking_cancelled" });
    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });

  it("snapshot: mudar o preco do servico depois nao altera o lancamento (SC-002)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: snapServiceId,
      startsAt: slotAt(DATE, 13 * 60),
    });
    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Preço vivo muda DEPOIS da captura.
    await prisma.service.update({ where: { id: snapServiceId }, data: { price: "99.00" } });

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: result.ledgerEntryId },
      include: { items: true },
    });
    expect(D(entry.amount.toString()).equals(D("50.00"))).toBe(true);
    expect(D(entry.items[0].amount.toString()).equals(D("50.00"))).toBe(true);

    // Restaura para não afetar outros testes deste arquivo.
    await prisma.service.update({ where: { id: snapServiceId }, data: { price: "50.00" } });
  });

  it("concluir booking cujo servico esta inativo e permitido (snapshot independe de isActive)", async () => {
    const svc = await prisma.service.create({
      data: {
        businessId: BUSINESS_ID,
        name: "ZZ005-cb-inactive",
        price: "35.00",
        durationMinutes: 30,
        isActive: true,
      },
      select: { id: true },
    });
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: svc.id,
      startsAt: slotAt(DATE, 14 * 60),
    });
    await prisma.service.update({ where: { id: svc.id }, data: { isActive: false } });

    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const entry = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { id: result.ledgerEntryId },
        include: { items: true },
      });
      expect(D(entry.items[0].amount.toString()).equals(D("35.00"))).toBe(true);
    }

    // Limpeza local: remove booking+lançamento antes de apagar o serviço criado no teste.
    await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
    await prisma.service.delete({ where: { id: svc.id } });
  });

  it("occurredAt: persiste o instante informado, nao derivado do endsAt (FR-017)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 15 * 60),
    });
    const occurredAt = new Date("2026-01-15T12:34:56.000Z"); // distinto de endsAt e de agora
    const result = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId, occurredAt });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(entry.occurredAt.toISOString()).toBe(occurredAt.toISOString());
    expect(entry.occurredAt.toISOString()).not.toBe(booking.endsAt.toISOString());
  });

  it("paymentMethod: registra COM e SEM, sem inferir de origin (FR-012/FR-013)", async () => {
    const b1 = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 16 * 60),
    });
    const r1 = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId: b1, paymentMethod: "PIX" });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const e1 = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: r1.ledgerEntryId } });
      expect(e1.paymentMethod).toBe("PIX");
      expect(e1.origin).toBe("BOOKING"); // origin do evento, não inferido do meio
    }

    const b2 = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 17 * 60),
    });
    const r2 = await completeBookingForOwner({ ownerId: OWNER_ID, bookingId: b2 });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const e2 = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: r2.ledgerEntryId } });
      expect(e2.paymentMethod).toBeNull();
    }
  });

  it("atomicidade: falha ao inserir o lancamento nao deixa o booking COMPLETED (SC-001)", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 9 * 60),
    });
    // ownerId inexistente viola a FK createdBy DENTRO da transação -> rollback de tudo.
    await expect(
      completeBookingForOwner({ ownerId: "owner-does-not-exist", bookingId }),
    ).rejects.toThrow();

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("ACTIVE");
    expect(await prisma.ledgerEntry.count({ where: { bookingId } })).toBe(0);
  });
});

describe("completeBooking (Server Action) — autorizacao por role (SC-009)", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    const bookingId = await seedBooking({
      userId: CLIENT_ID,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE, 9 * 60 + 30),
    });

    actAs(CLIENT_ID);
    await expect(completeBooking({ bookingId })).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(completeBooking({ bookingId })).resolves.toMatchObject({ ok: true });
  });
});
