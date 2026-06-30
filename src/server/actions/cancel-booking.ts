"use server";

import { requireUser } from "@/server/auth/session";
import {
  cancelBookingForUser,
  type CancelBookingResult,
} from "@/server/booking/cancel-booking";

/**
 * Server Action: cancela um agendamento do usuário autenticado (FR-011). O owner deriva da sessão;
 * a verificação de propriedade ocorre no core (FR-012).
 */
export async function cancelBooking(input: { bookingId: string }): Promise<CancelBookingResult> {
  const user = await requireUser();
  return cancelBookingForUser({ userId: user.id, bookingId: input.bookingId });
}
