"use server";

import { requireUser } from "@/server/auth/session";
import {
  rescheduleBookingForUser,
  type RescheduleBookingResult,
} from "@/server/booking/reschedule-booking";

/**
 * Server Action de remarcação (004). Exige sessão; o owner deriva da sessão no servidor, nunca do
 * cliente (Princípio I / FR-007). Converte `startsAt` ISO→Date e delega ao core (padrão de
 * `cancelBooking`). Não contém regra de negócio.
 */
export async function rescheduleBooking(input: {
  bookingId: string;
  serviceId: string;
  startsAt: string; // ISO 8601 (UTC)
}): Promise<RescheduleBookingResult> {
  const user = await requireUser();
  return rescheduleBookingForUser({
    userId: user.id,
    bookingId: input.bookingId,
    serviceId: input.serviceId,
    startsAt: new Date(input.startsAt),
  });
}
