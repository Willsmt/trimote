import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { utcToLocalMinutes, weekdayInZone } from "@/domain/time";

/**
 * Núcleo da criação de agendamento (FR-007..FR-009, FR-015), testável de forma isolada com um
 * userId explícito — a Server Action (create-booking action) deriva o owner da sessão.
 *
 * A não-sobreposição NÃO é garantida aqui: ela é responsabilidade da exclusion constraint do
 * Postgres (Princípio II). Esta função apenas insere dentro de uma transação e TRADUZ a violação
 * da constraint em uma recusa de negócio "slot_unavailable".
 */

export interface CreateBookingInput {
  userId: string;
  serviceId: string;
  startsAt: Date;
  /** Instante atual (UTC); default new Date(). Injetável para testes. */
  now?: Date;
}

export type CreateBookingFailureReason =
  | "service_not_found"
  | "service_inactive"
  | "in_the_past"
  | "outside_opening_hours"
  | "slot_unavailable";

export type CreateBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: CreateBookingFailureReason };

/**
 * Detecta a violação da exclusion constraint de não-sobreposição. O Prisma NÃO mapeia exclusion
 * violations para P2002 (que é unique); o Postgres usa SQLSTATE 23P01. Identificamos pela
 * SQLSTATE ou pelo nome da constraint, sem assumir um código de erro do Prisma (research.md D2).
 */
export function isExclusionViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const text = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
    return text.includes("booking_no_overlap") || text.includes("23P01");
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return error.message.includes("booking_no_overlap") || error.message.includes("23P01");
  }
  return false;
}

export async function createBookingForUser(input: CreateBookingInput): Promise<CreateBookingResult> {
  const now = input.now ?? new Date();

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { business: { include: { openingHours: true } } },
  });
  if (!service) {
    return { ok: false, reason: "service_not_found" };
  }
  // Não se cria compromisso FUTURO com um serviço desativado (issue #1). Distinto de
  // service_not_found (o serviço existe) e coerente com a F004, que já usa service_inactive. NÃO
  // confundir com a conclusão (F005), onde o snapshot registra o que aconteceu, independente de isActive.
  if (!service.isActive) {
    return { ok: false, reason: "service_inactive" };
  }

  // FR-006: não aceitar agendamento no passado.
  if (input.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "in_the_past" };
  }

  // Revalidação de expediente no servidor (FR-004/FR-005), no fuso da barbearia.
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

  // endsAt materializado (research.md D8) — calculado dentro da transação de criação.
  const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);

  try {
    const booking = await prisma.$transaction((tx) =>
      tx.booking.create({
        data: {
          businessId: service.businessId,
          userId: input.userId,
          serviceId: service.id,
          startsAt: input.startsAt,
          endsAt,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
    );
    return { ok: true, bookingId: booking.id };
  } catch (error) {
    // A violação da exclusion constraint é fluxo de negócio ESPERADO (horário ocupado por uma
    // criação concorrente), não um erro: traduzimos em recusa e não relançamos nem logamos. O
    // logger do Prisma também filtra esse caso (ver src/server/db/client.ts).
    if (isExclusionViolation(error)) {
      return { ok: false, reason: "slot_unavailable" };
    }
    // Qualquer outro erro é inesperado e deve propagar (logado/sanitizado pela camada de erro).
    throw error;
  }
}
