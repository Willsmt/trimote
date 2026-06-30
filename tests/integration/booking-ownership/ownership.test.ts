import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { createBookingForUser } from "@/server/booking/create-booking";
import { listBookingsForUser } from "@/server/booking/list-my-bookings";
import { cancelBookingForUser } from "@/server/booking/cancel-booking";
import { localDateTimeToUtc } from "@/domain/time";

// Teste de integração (toca Postgres) — ownership e liberação de horário (FR-010..FR-013).
// Usa data 2026-12-09 (quarta, com expediente) para isolar dos demais testes de integração.
const SP = "America/Sao_Paulo";
const SERVICE_ID = "service-corte"; // 30min no seed
const USER_A = "u-it-owner-a";
const USER_B = "u-it-owner-b";

const slotAt = (minutes: number) => localDateTimeToUtc("2026-12-09", minutes, SP);

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: "owner-a@example.com" },
  });
  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: "owner-b@example.com" },
  });
});

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  await prisma.$disconnect();
});

describe("listBookingsForUser (FR-010/FR-012)", () => {
  it("retorna apenas os agendamentos do próprio usuário", async () => {
    const a = await createBookingForUser({ userId: USER_A, serviceId: SERVICE_ID, startsAt: slotAt(11 * 60) });
    await createBookingForUser({ userId: USER_B, serviceId: SERVICE_ID, startsAt: slotAt(12 * 60) });
    expect(a.ok).toBe(true);

    const listA = await listBookingsForUser(USER_A);
    expect(listA).toHaveLength(1);
    expect(listA.every((b) => b.id === (a.ok ? a.bookingId : ""))).toBe(true);
  });
});

describe("cancelBookingForUser (FR-011/FR-012/FR-013)", () => {
  it("o dono cancela e o agendamento fica CANCELLED", async () => {
    const created = await createBookingForUser({ userId: USER_A, serviceId: SERVICE_ID, startsAt: slotAt(11 * 60) });
    if (!created.ok) throw new Error("setup falhou");

    const result = await cancelBookingForUser({ userId: USER_A, bookingId: created.bookingId });
    expect(result).toEqual({ ok: true });

    const booking = await prisma.booking.findUnique({ where: { id: created.bookingId } });
    expect(booking?.status).toBe("CANCELLED");
    expect(booking?.cancelledAt).not.toBeNull();
  });

  it("um não-dono não consegue cancelar e o agendamento continua ATIVO (FR-012)", async () => {
    const created = await createBookingForUser({ userId: USER_A, serviceId: SERVICE_ID, startsAt: slotAt(11 * 60) });
    if (!created.ok) throw new Error("setup falhou");

    const result = await cancelBookingForUser({ userId: USER_B, bookingId: created.bookingId });
    expect(result).toEqual({ ok: false, reason: "not_owner" });

    const booking = await prisma.booking.findUnique({ where: { id: created.bookingId } });
    expect(booking?.status).toBe("ACTIVE");
  });

  it("cancelar um agendamento libera o horário para outro (FR-013)", async () => {
    const slot = slotAt(11 * 60);
    const first = await createBookingForUser({ userId: USER_A, serviceId: SERVICE_ID, startsAt: slot });
    if (!first.ok) throw new Error("setup falhou");

    // Antes de cancelar, o mesmo horário está ocupado.
    const blocked = await createBookingForUser({ userId: USER_B, serviceId: SERVICE_ID, startsAt: slot });
    expect(blocked).toEqual({ ok: false, reason: "slot_unavailable" });

    // Cancelar libera (constraint parcial em ACTIVE).
    await cancelBookingForUser({ userId: USER_A, bookingId: first.bookingId });

    const reused = await createBookingForUser({ userId: USER_B, serviceId: SERVICE_ID, startsAt: slot });
    expect(reused.ok).toBe(true);
  });

  it("cancelar um agendamento já cancelado retorna already_cancelled", async () => {
    const created = await createBookingForUser({ userId: USER_A, serviceId: SERVICE_ID, startsAt: slotAt(11 * 60) });
    if (!created.ok) throw new Error("setup falhou");

    await cancelBookingForUser({ userId: USER_A, bookingId: created.bookingId });
    const again = await cancelBookingForUser({ userId: USER_A, bookingId: created.bookingId });
    expect(again).toEqual({ ok: false, reason: "already_cancelled" });
  });
});
