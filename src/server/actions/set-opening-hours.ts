"use server";

import { requireOwner } from "@/server/auth/owner";
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
  const { businessId } = await requireOwner();
  return setOpeningHoursCore({ businessId, ...input });
}
