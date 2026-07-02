import { prisma } from "@/server/db/client";

/**
 * Cancelamento de agendamento (FR-011/FR-013). Só o dono pode cancelar; o cancelamento é um soft
 * delete (status = CANCELLED). Como a exclusion constraint é parcial em ACTIVE, cancelar libera
 * automaticamente o intervalo para outro cliente.
 */
export type CancelBookingReason =
  | "not_found"
  | "not_owner"
  | "already_cancelled"
  | "already_completed";

export type CancelBookingResult = { ok: true } | { ok: false; reason: CancelBookingReason };

export async function cancelBookingForUser(input: {
  userId: string;
  bookingId: string;
}): Promise<CancelBookingResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { userId: true, status: true },
  });

  if (!booking) {
    return { ok: false, reason: "not_found" };
  }
  // FR-012: um não-dono não pode cancelar (nem é informado de detalhes do agendamento alheio).
  if (booking.userId !== input.userId) {
    return { ok: false, reason: "not_owner" };
  }
  if (booking.status === "CANCELLED") {
    return { ok: false, reason: "already_cancelled" };
  }
  // 005: como este core é DENYLIST (segue para o UPDATE quando não recusa), um agendamento CONCLUÍDO
  // precisa de branch próprio ANTES do update — senão seria cancelado indevidamente. Reason distinto
  // de already_cancelled para a UI renderizar mensagem específica (FR-005).
  if (booking.status === "COMPLETED") {
    return { ok: false, reason: "already_completed" };
  }

  await prisma.booking.update({
    where: { id: input.bookingId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return { ok: true };
}
