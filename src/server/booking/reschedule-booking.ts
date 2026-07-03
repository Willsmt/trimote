import { prisma } from "@/server/db/client";
import { isExclusionViolation } from "@/server/booking/create-booking";
import { utcToLocalMinutes, weekdayInZone } from "@/domain/time";

/**
 * Núcleo da remarcação de agendamento (004-reschedule-booking), testável de forma isolada com um
 * `userId` e `now` explícitos — a Server Action deriva o owner da sessão.
 *
 * Remarcar é um UPDATE da MESMA linha `Booking` (mantém a identidade — FR-001): muda
 * `serviceId`/`startsAt`/`endsAt`. A não-sobreposição NÃO é garantida aqui: continua sendo a
 * exclusion constraint `booking_no_overlap` do Postgres (Princípio II). Esta função apenas roda o
 * UPDATE em transação e TRADUZ a violação (`23P01`) em `slot_unavailable`.
 *
 * Ordem de verificação (curto-circuito; nenhuma recusa altera o booking — FR-009):
 *   not_found → not_owner → already_completed → not_active → booking_in_past → no_change
 *   → service_not_found → service_inactive → in_the_past → outside_opening_hours
 *   → UPDATE ($transaction) / 23P01 → slot_unavailable
 */

export interface RescheduleBookingInput {
  userId: string;
  bookingId: string;
  serviceId: string;
  startsAt: Date;
  /** Instante atual (UTC); default new Date(). Injetável para testes. */
  now?: Date;
}

export type RescheduleBookingReason =
  | "not_found"
  | "not_owner"
  | "already_completed"
  | "not_active"
  | "booking_in_past"
  | "service_not_found"
  | "service_inactive"
  | "in_the_past"
  | "outside_opening_hours"
  | "no_change"
  | "slot_unavailable";

export type RescheduleBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: RescheduleBookingReason };

export async function rescheduleBookingForUser(
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  const now = input.now ?? new Date();

  // --- Enforcement de posse/elegibilidade (segurança primeiro — Princípio I) ---
  // Curto-circuito e SEM efeito colateral: nenhuma dessas recusas altera o booking (FR-009).
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, userId: true, status: true, startsAt: true, serviceId: true },
  });

  // 1. Booking inexistente (FR-007/FR-010).
  if (!booking) {
    return { ok: false, reason: "not_found" };
  }
  // 2. Posse: só o dono remarca; um não-dono não é informado de detalhes alheios (FR-007).
  if (booking.userId !== input.userId) {
    return { ok: false, reason: "not_owner" };
  }
  // 3. Estado terminal (005): um agendamento CONCLUÍDO não é remarcável. Reason próprio e distinto
  //    (não reutiliza not_active) para a UI renderizar mensagem específica (FR-005). Vem ANTES do
  //    check allowlist `!== ACTIVE` para não cair no genérico not_active.
  if (booking.status === "COMPLETED") {
    return { ok: false, reason: "already_completed" };
  }
  // 4. Elegibilidade (ativo): não se remarca um agendamento cancelado (FR-008).
  if (booking.status !== "ACTIVE") {
    return { ok: false, reason: "not_active" };
  }
  // 4. Elegibilidade (futuro): fronteira pelo INÍCIO — já iniciado/passado não remarca (FR-008).
  if (booking.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "booking_in_past" };
  }

  // --- Move (mesmo serviço) ---
  // 5. no_change: mesmo serviço E mesmo horário → recusa amigável, sem carregar serviço nem escrever.
  if (input.serviceId === booking.serviceId && input.startsAt.getTime() === booking.startsAt.getTime()) {
    return { ok: false, reason: "no_change" };
  }

  // 6. Carrega o serviço escolhido (com expediente da barbearia).
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { business: { include: { openingHours: true } } },
  });
  if (!service) {
    return { ok: false, reason: "service_not_found" };
  }

  // 6b. Troca para serviço inativo (FR-014): a recusa só dispara na TROCA real. Se o cliente
  // MANTÉM o serviço atual (mesmo que já esteja inativo por soft delete da 002), NÃO checamos
  // isActive — assim a remarcação não bloqueia um agendamento existente cujo serviço foi desativado.
  if (input.serviceId !== booking.serviceId && service.isActive === false) {
    return { ok: false, reason: "service_inactive" };
  }

  // 7. Alvo no passado (FR-005).
  if (input.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "in_the_past" };
  }

  // 8. Encaixe no expediente do dia, no fuso da barbearia (Princípio VII).
  const timeZone = service.business.timezone;
  const weekday = weekdayInZone(input.startsAt, timeZone);
  const window = service.business.openingHours.find((oh) => oh.weekday === weekday);
  if (!window) {
    return { ok: false, reason: "outside_opening_hours" };
  }
  const startMinutes = utcToLocalMinutes(input.startsAt, timeZone);
  const endMinutes = startMinutes + service.durationMinutes;
  if (startMinutes < window.opensAtMinutes || endMinutes > window.closesAtMinutes) {
    return { ok: false, reason: "outside_opening_hours" };
  }

  // 9. UPDATE atômico da MESMA linha (identidade preservada — FR-001). endsAt materializado pela
  // duração do serviço escolhido. A não-sobreposição é da exclusion constraint (Princípio II);
  // aqui só traduzimos a violação (23P01) em slot_unavailable, como em createBooking.
  const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
  try {
    await prisma.$transaction((tx) =>
      tx.booking.update({
        where: { id: booking.id },
        data: {
          serviceId: service.id,
          startsAt: input.startsAt,
          endsAt,
        },
        select: { id: true },
      }),
    );
    return { ok: true, bookingId: booking.id };
  } catch (error) {
    // Colisão com outro booking ativo (incl. concorrência) é fluxo de negócio esperado: traduzimos
    // em recusa, sem relançar nem logar. Qualquer outro erro propaga.
    if (isExclusionViolation(error)) {
      return { ok: false, reason: "slot_unavailable" };
    }
    throw error;
  }
}
