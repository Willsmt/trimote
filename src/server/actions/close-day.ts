"use server";

import { requireOwner } from "@/server/auth/owner";
import { closeDay as closeDayCore, type OpeningHoursMutationResult } from "@/server/owner/opening-hours";

/** Server Action: marca um dia como fechado (US2 / FR-008). Exige OWNER. */
export async function closeDay(input: { weekday: number }): Promise<OpeningHoursMutationResult> {
  const { businessId } = await requireOwner();
  return closeDayCore({ businessId, weekday: input.weekday });
}
