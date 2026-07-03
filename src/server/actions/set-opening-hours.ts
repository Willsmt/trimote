"use server";

import { requireOwner } from "@/server/auth/owner";
import { getOwnerBusinessId } from "@/server/owner/business";
import {
  setOpeningHours as setOpeningHoursCore,
  type OpeningHoursMutationResult,
} from "@/server/owner/opening-hours";

/** Server Action: define abertura/fechamento de um dia (US2 / FR-008/FR-009). Exige OWNER. */
export async function setOpeningHours(input: {
  weekday: number;
  opensAtMinutes: number;
  closesAtMinutes: number;
}): Promise<OpeningHoursMutationResult> {
  await requireOwner();
  const businessId = await getOwnerBusinessId();
  return setOpeningHoursCore({ businessId, ...input });
}
