"use server";

import { requireOwner } from "@/server/auth/owner";
import { getOwnerBarbershopId } from "@/server/owner/barbershop";
import { listOpeningHours, type OpeningHoursItem } from "@/server/owner/opening-hours";

/** Server Action: lista o expediente atual para o painel (US2). Exige OWNER. */
export async function listOpeningHoursForOwner(): Promise<OpeningHoursItem[]> {
  await requireOwner();
  const barbershopId = await getOwnerBarbershopId();
  return listOpeningHours({ barbershopId });
}
