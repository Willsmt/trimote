"use server";

import { requireUser } from "@/server/auth/session";
import { listBookingsForUser, type MyBooking } from "@/server/booking/list-my-bookings";

/**
 * Server Action: lista os agendamentos do usuário autenticado (FR-010). Owner deriva da sessão.
 */
export async function listMyBookings(): Promise<MyBooking[]> {
  const user = await requireUser();
  return listBookingsForUser(user.id);
}
