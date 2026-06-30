import type { BookingStatus } from "@prisma/client";

import { prisma } from "@/server/db/client";

/**
 * Lista os agendamentos do próprio usuário (FR-010/FR-012). A consulta filtra estritamente por
 * userId — agendamentos de terceiros nunca são retornados.
 */
export interface MyBooking {
  id: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
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
      service: { select: { name: true } },
    },
  });

  return bookings.map((booking) => ({
    id: booking.id,
    serviceName: booking.service.name,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
  }));
}
