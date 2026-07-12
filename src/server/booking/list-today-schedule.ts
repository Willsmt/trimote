import type { BookingStatus } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { periodBoundsInZone, todayInZone } from "@/domain/time";

/**
 * Agenda do dia do dono (issue #13, parte c). LEITURA PURA: os agendamentos ACTIVE de HOJE do negocio
 * ativo, no fuso do negocio, ordenados por horario de inicio.
 *
 * Escopo por negocio (anti-IDOR, mesmo padrao da #6): `businessId` e `timeZone` vem de
 * `requireOwner()` (vinculo da sessao), NUNCA do input do client — o core filtra `where businessId`,
 * entao nao ha leitura cross-tenant. A janela do dia usa `todayInZone` + `periodBoundsInZone("day")`:
 * limites `[startUtc, endUtc)` derivados no fuso e comparados como range sobre a coluna nua `startsAt`
 * (usa o indice `(businessId, status)`; nunca funcao sobre `startsAt`) — correto na borda da meia-noite
 * (um horario tarde da noite local cai em outro dia UTC e ainda assim entra no dia local certo).
 *
 * `now` e injetavel (default `new Date()`) para testes deterministicos, como em `createBookingForUser`.
 */

export interface TodayScheduleItem {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  serviceName: string;
  clientName: string | null;
  clientEmail: string | null;
  // Telefone/WhatsApp do cliente (issue #34): alimenta o link wa.me na agenda. Só o dono do negócio
  // ativo vê — a query já é escopada por businessId (requireOwner), então o campo não vaza cross-tenant.
  clientPhone: string | null;
}

export interface TodayScheduleInput {
  /** Negocio ativo do dono (derivado de requireOwner, NUNCA do input). */
  businessId: string;
  /** Fuso do negocio (derivado de requireOwner). */
  timeZone: string;
  /** Instante atual (UTC); default new Date(). Injetavel para testes. */
  now?: Date;
}

export async function listTodayScheduleForOwner(
  input: TodayScheduleInput,
): Promise<TodayScheduleItem[]> {
  const now = input.now ?? new Date();
  const referenceLocalDate = todayInZone(now, input.timeZone);
  const { startUtc, endUtc } = periodBoundsInZone(referenceLocalDate, "day", input.timeZone);

  const bookings = await prisma.booking.findMany({
    where: {
      businessId: input.businessId,
      status: "ACTIVE",
      startsAt: { gte: startUtc, lt: endUtc },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      service: { select: { name: true } },
      user: { select: { name: true, email: true, phone: true } },
    },
  });

  return bookings.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    status: b.status,
    serviceName: b.service.name,
    clientName: b.user.name ?? null,
    clientEmail: b.user.email ?? null,
    clientPhone: b.user.phone ?? null,
  }));
}
