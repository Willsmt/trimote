"use server";

import { requireUser } from "@/server/auth/session";
import {
  createBookingForUser,
  type CreateBookingResult,
} from "@/server/booking/create-booking";

/**
 * Server Action de criação de agendamento (FR-007). Exige sessão; o owner deriva da sessão no
 * servidor, nunca do cliente (FR-001). Delega a regra de negócio a createBookingForUser.
 */
export async function createBooking(input: {
  serviceId: string;
  startsAt: string; // ISO 8601 (UTC)
}): Promise<CreateBookingResult> {
  const user = await requireUser();
  return createBookingForUser({
    userId: user.id,
    serviceId: input.serviceId,
    startsAt: new Date(input.startsAt),
  });
}
