"use server";

import type { PaymentMethod } from "@prisma/client";

import { requireOwner } from "@/server/auth/owner";
import {
  completeBookingForOwner,
  type CompleteBookingExtraInput,
  type CompleteBookingResult,
} from "@/server/ledger/complete-booking";

/**
 * Server Action de conclusão de atendimento (005, US1). Exige OWNER (autorização por ROLE no
 * servidor — `requireOwner`, FR-018); o autor deriva da sessão, nunca do cliente. Converte
 * `occurredAt` ISO→Date e delega ao core. Sem regra de negócio aqui.
 */
export async function completeBooking(input: {
  bookingId: string;
  occurredAt?: string; // ISO 8601 (UTC)
  paymentMethod?: PaymentMethod;
  extras?: CompleteBookingExtraInput[];
}): Promise<CompleteBookingResult> {
  const owner = await requireOwner();
  // Escopo por negócio (007, issue #6): o core valida `booking.businessId === businessId` do vínculo
  // (booking de outro negócio → booking_not_found), então o LedgerEntry gerado é garantidamente do
  // negócio ATIVO — o businessId vem do vínculo da sessão, nunca do input nem do booking alheio.
  return completeBookingForOwner({
    businessId: owner.businessId,
    ownerId: owner.user.id,
    bookingId: input.bookingId,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    paymentMethod: input.paymentMethod,
    extras: input.extras,
  });
}
