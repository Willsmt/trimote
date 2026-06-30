import { prisma } from "@/server/db/client";

/**
 * Core de gestão do horário de funcionamento (US2). As Server Actions chamam `requireOwner` antes
 * de delegar aqui.
 *
 * NUNCA escreve em `Booking`: mudar o expediente afeta apenas o cálculo de disponibilidade futura
 * (domínio puro da 001, que lê `OpeningHours` em tempo de consulta) — agendamentos já gravados não
 * são tocados nem cancelados (FR-011).
 */

const MINUTES_IN_DAY = 24 * 60;

export type OpeningHoursFailureReason = "invalid_input";

export type OpeningHoursMutationResult = { ok: true } | { ok: false; reason: OpeningHoursFailureReason };

export interface SetOpeningHoursInput {
  barbershopId: string;
  weekday: number; // 0 = domingo .. 6 = sábado
  opensAtMinutes: number;
  closesAtMinutes: number;
}

function isValidWeekday(weekday: number): boolean {
  return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6;
}

function isValidMinute(minute: number): boolean {
  return Number.isInteger(minute) && minute >= 0 && minute <= MINUTES_IN_DAY;
}

export async function setOpeningHours(
  input: SetOpeningHoursInput,
): Promise<OpeningHoursMutationResult> {
  const { barbershopId, weekday, opensAtMinutes, closesAtMinutes } = input;

  if (
    !isValidWeekday(weekday) ||
    !isValidMinute(opensAtMinutes) ||
    !isValidMinute(closesAtMinutes) ||
    closesAtMinutes <= opensAtMinutes // FR-009: fechamento > abertura
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  await prisma.openingHours.upsert({
    where: { barbershopId_weekday: { barbershopId, weekday } },
    update: { opensAtMinutes, closesAtMinutes },
    create: { barbershopId, weekday, opensAtMinutes, closesAtMinutes },
  });

  return { ok: true };
}

/**
 * Marca um dia como fechado removendo a janela do weekday. Idempotente: fechar um dia já fechado é
 * um no-op de sucesso (FR-008).
 */
export async function closeDay(input: {
  barbershopId: string;
  weekday: number;
}): Promise<OpeningHoursMutationResult> {
  if (!isValidWeekday(input.weekday)) {
    return { ok: false, reason: "invalid_input" };
  }
  await prisma.openingHours.deleteMany({
    where: { barbershopId: input.barbershopId, weekday: input.weekday },
  });
  return { ok: true };
}

export interface OpeningHoursItem {
  weekday: number;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export async function listOpeningHours(input: {
  barbershopId: string;
}): Promise<OpeningHoursItem[]> {
  const rows = await prisma.openingHours.findMany({
    where: { barbershopId: input.barbershopId },
    orderBy: { weekday: "asc" },
    select: { weekday: true, opensAtMinutes: true, closesAtMinutes: true },
  });
  return rows;
}
