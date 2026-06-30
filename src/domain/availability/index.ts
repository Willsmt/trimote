import { localDateTimeToUtc } from "@/domain/time";

/**
 * Cálculo de disponibilidade — lógica de domínio pura, sem I/O (FR-003..FR-006).
 *
 * Recebe o horário de funcionamento (hora local em minutos), a duração do serviço, os
 * agendamentos ativos (instantes UTC) e "agora"; devolve os instantes UTC de início dos
 * horários livres. Toda conversão de fuso passa pela camada src/domain/time (Princípio VII).
 */

export interface OpeningWindow {
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export interface BookingInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityInput {
  /** Data local no fuso da barbearia (YYYY-MM-DD). */
  date: string;
  timeZone: string;
  /** Janela de funcionamento do dia, ou null se a barbearia estiver fechada. */
  openingHours: OpeningWindow | null;
  /** Duração do serviço escolhido, em minutos. */
  durationMinutes: number;
  /** Agendamentos ativos do dia (instantes UTC). */
  activeBookings: BookingInterval[];
  /** Passo entre slots, em minutos (default 30). */
  slotStepMinutes?: number;
  /** Instante atual (UTC), para excluir horários no passado. */
  now: Date;
}

const DEFAULT_SLOT_STEP_MINUTES = 30;

export function computeAvailableSlots(input: AvailabilityInput): Date[] {
  const { date, timeZone, openingHours, durationMinutes, activeBookings, now } = input;
  const step = input.slotStepMinutes ?? DEFAULT_SLOT_STEP_MINUTES;

  // Dia sem expediente: nenhum horário livre.
  if (!openingHours) {
    return [];
  }

  const slots: Date[] = [];

  // Gera horários de início a cada `step`, enquanto o serviço couber inteiro antes do fechamento.
  for (
    let startMinutes = openingHours.opensAtMinutes;
    startMinutes + durationMinutes <= openingHours.closesAtMinutes;
    startMinutes += step
  ) {
    const startsAt = localDateTimeToUtc(date, startMinutes, timeZone);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    // FR-006: não oferecer horários no passado.
    if (startsAt.getTime() <= now.getTime()) {
      continue;
    }

    // Sobreposição com intervalo semiaberto [início, fim): adjacência é válida.
    const overlapsActive = activeBookings.some(
      (booking) => startsAt < booking.endsAt && booking.startsAt < endsAt,
    );
    if (overlapsActive) {
      continue;
    }

    slots.push(startsAt);
  }

  return slots;
}
