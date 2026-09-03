import type { BookingStatus } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { formatBRL } from "@/domain/money";

/**
 * Lista os agendamentos do próprio usuário (FR-010/FR-012). A consulta filtra estritamente por
 * userId — agendamentos de terceiros nunca são retornados.
 */
export interface MyBooking {
  id: string;
  serviceName: string;
  /** Nome do negócio (007, US5): a conta do cliente é global; cada agendamento identifica seu negócio. */
  businessName: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  /** formatBRL(booking.sinalValor) — SNAPSHOT gravado na criação (issue #56); null sem sinal. */
  sinalValorLabel: string | null;
  /** business.chavePix AO VIVO (issue #56) — sem coluna própria no Booking; reflete o valor atual. */
  chavePix: string | null;
}

export async function listBookingsForUser(userId: string): Promise<MyBooking[]> {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      sinalValor: true,
      service: { select: { name: true } },
      business: { select: { name: true, chavePix: true } },
    },
  });

  return bookings.map((booking) => ({
    id: booking.id,
    serviceName: booking.service.name,
    businessName: booking.business.name,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    sinalValorLabel: booking.sinalValor === null ? null : formatBRL(booking.sinalValor),
    chavePix: booking.business.chavePix,
  }));
}
