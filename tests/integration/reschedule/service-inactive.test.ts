import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { rescheduleBookingForUser } from "@/server/booking/reschedule-booking";
import {
  BARBERSHOP_ID,
  SERVICE_CORTE,
  cleanupBookings,
  seedBooking,
  slotAt,
  teardownUsers,
  upsertUsers,
} from "./fixtures";

// Teste de integração (Postgres) — service_inactive (FR-014, SC-009). A recusa só dispara na TROCA
// real para um serviço inativo; MANTER o serviço atual (mesmo inativo) não bloqueia (preserva o
// agendamento existente).
const DATE = "2026-12-22"; // terça-feira, expediente 09:00–18:00
const USER = "u-it-resch-svcinactive";
// Serviço inativo dedicado ao teste (soft delete da 002). Nome próprio p/ não colidir com o índice
// único parcial de nomes ativos.
const INACTIVE_SERVICE_ID = "service-it-inactive";

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "resch-svcinactive@example.com" }]);
  await prisma.barbershopService.upsert({
    where: { id: INACTIVE_SERVICE_ID },
    update: { isActive: false },
    create: {
      id: INACTIVE_SERVICE_ID,
      barbershopId: BARBERSHOP_ID,
      name: "Servico Inativo (IT)",
      price: "20.00",
      durationMinutes: 30,
      isActive: false,
    },
  });
});

afterEach(async () => {
  await cleanupBookings([USER]);
});

afterAll(async () => {
  await teardownUsers([USER]); // remove bookings do usuário antes do serviço (FK)
  await prisma.barbershopService.deleteMany({ where: { id: INACTIVE_SERVICE_ID } });
});

describe("rescheduleBookingForUser (service_inactive)", () => {
  it("(a) trocar para um serviço inativo → service_inactive, sem alterar o booking", async () => {
    const bookingId = await seedBooking({ userId: USER, serviceId: SERVICE_CORTE, startsAt: slotAt(DATE, 10 * 60) });

    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: INACTIVE_SERVICE_ID, // troca real p/ serviço inativo
      startsAt: slotAt(DATE, 14 * 60),
    });

    expect(result).toEqual({ ok: false, reason: "service_inactive" });

    const original = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(original.serviceId).toBe(SERVICE_CORTE);
    expect(original.startsAt.toISOString()).toBe(slotAt(DATE, 10 * 60).toISOString());
  });

  it("(b) manter o serviço atual (mesmo inativo) e só mudar o horário → NÃO bloqueia", async () => {
    // Booking cujo serviço atual já está inativo.
    const bookingId = await seedBooking({
      userId: USER,
      serviceId: INACTIVE_SERVICE_ID,
      startsAt: slotAt(DATE, 11 * 60),
    });

    const result = await rescheduleBookingForUser({
      userId: USER,
      bookingId,
      serviceId: INACTIVE_SERVICE_ID, // mantém o mesmo serviço (não é troca)
      startsAt: slotAt(DATE, 15 * 60),
    });

    expect(result).toEqual({ ok: true, bookingId });

    const moved = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(moved.serviceId).toBe(INACTIVE_SERVICE_ID);
    expect(moved.startsAt.toISOString()).toBe(slotAt(DATE, 15 * 60).toISOString());
  });
});
