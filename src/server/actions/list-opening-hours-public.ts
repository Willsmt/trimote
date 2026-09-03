"use server";

import { prisma } from "@/server/db/client";

/**
 * Leitura PÚBLICA do expediente (007, #50). Espelha a query de `listOpeningHours`
 * (src/server/owner/opening-hours.ts) — mesma shape, mesma ordenação — mas SEM `requireOwner`: a
 * página pública (`/b/[slug]`) precisa mostrar o horário de funcionamento pro cliente antes mesmo
 * dele agendar. Função separada de propósito: a leitura do dono não perde o gate por engano se
 * algum dia ganhar um campo a mais.
 */
export interface OpeningHoursItem {
  weekday: number;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export async function listOpeningHoursPublic(businessId: string): Promise<OpeningHoursItem[]> {
  return prisma.openingHours.findMany({
    where: { businessId },
    orderBy: { weekday: "asc" },
    select: { weekday: true, opensAtMinutes: true, closesAtMinutes: true },
  });
}
