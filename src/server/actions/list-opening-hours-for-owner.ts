"use server";

import { requireOwner } from "@/server/auth/owner";
import { getOwnerBusinessId } from "@/server/owner/business";
import { listOpeningHours, type OpeningHoursItem } from "@/server/owner/opening-hours";

/** Server Action: lista o expediente atual para o painel (US2). Exige OWNER. */
export async function listOpeningHoursForOwner(): Promise<OpeningHoursItem[]> {
  await requireOwner();
  const businessId = await getOwnerBusinessId();
  return listOpeningHours({ businessId });
}
