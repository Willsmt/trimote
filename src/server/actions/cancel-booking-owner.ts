"use server";

import { requireOwner } from "@/server/auth/owner";
import {
  cancelBookingForOwner,
  type CancelBookingForOwnerResult,
} from "@/server/booking/cancel-booking";

/**
 * Server Action de cancelamento pelo DONO (issue #25). Exige OWNER (`requireOwner`) e delega ao
 * core. Sem regra de negócio aqui. O `businessId` vem do vínculo da sessão, NUNCA do input —
 * distinta de `cancelBooking` (fluxo do cliente, autorizado por posse do booking).
 */
export async function cancelBookingByOwner(input: {
  bookingId: string;
}): Promise<CancelBookingForOwnerResult> {
  const { businessId } = await requireOwner();
  return cancelBookingForOwner({ businessId, bookingId: input.bookingId });
}
