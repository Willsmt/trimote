"use server";

import { prisma } from "@/server/db/client";
import { computeAvailableSlots } from "@/domain/availability";
import { localDateTimeToUtc, weekdayInZone } from "@/domain/time";

/**
 * Server Action de disponibilidade (FR-003..FR-006). Carrega o expediente do dia e os agendamentos
 * ativos, delega o cálculo à lógica de domínio pura e devolve os horários de início livres em
 * ISO 8601 (UTC).
 */
export type GetAvailableSlotsResult =
  | { ok: true; slots: string[] }
  | { ok: false; reason: "service_not_found" | "service_inactive" };

export async function getAvailableSlots(input: {
  serviceId: string;
  date: string; // YYYY-MM-DD no fuso da barbearia
  excludeBookingId?: string; // remarcação (004): exclui esse booking do cálculo de colisão
}): Promise<GetAvailableSlotsResult> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { business: { include: { openingHours: true } } },
  });
  if (!service) {
    return { ok: false, reason: "service_not_found" };
  }
  // No fluxo de CRIAÇÃO (sem excludeBookingId) não se oferece horário de serviço desativado (issue
  // #1). Na REMARCAÇÃO (com excludeBookingId) permite-se: a F004 deixa remarcar mantendo um serviço
  // que ficou inativo — bloquear aqui esconderia os horários e regrediria esse fluxo.
  if (!service.isActive && !input.excludeBookingId) {
    return { ok: false, reason: "service_inactive" };
  }

  const timeZone = service.business.timezone;

  // Limites do dia local (em UTC) para buscar apenas os agendamentos daquele dia.
  const dayStartUtc = localDateTimeToUtc(input.date, 0, timeZone);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60_000);
  const weekday = weekdayInZone(dayStartUtc, timeZone);
  const window = service.business.openingHours.find((oh) => oh.weekday === weekday) ?? null;

  const activeBookings = await prisma.booking.findMany({
    where: {
      businessId: service.businessId,
      status: "ACTIVE",
      startsAt: { gte: dayStartUtc, lt: dayEndUtc },
      // Remarcação (004, D1): o booking sendo movido não deve bloquear o próprio horário/adjacências.
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });

  const slots = computeAvailableSlots({
    date: input.date,
    timeZone,
    openingHours: window
      ? { opensAtMinutes: window.opensAtMinutes, closesAtMinutes: window.closesAtMinutes }
      : null,
    durationMinutes: service.durationMinutes,
    activeBookings,
    now: new Date(),
  });

  return { ok: true, slots: slots.map((slot) => slot.toISOString()) };
}
