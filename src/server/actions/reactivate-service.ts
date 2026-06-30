"use server";

import { requireOwner } from "@/server/auth/owner";
import { reactivateService as reactivateServiceCore, type ServiceMutationResult } from "@/server/owner/services";

/** Server Action: reativa um serviço inativo (US1 / FR-006a). Exige OWNER. */
export async function reactivateService(input: {
  serviceId: string;
}): Promise<ServiceMutationResult> {
  await requireOwner();
  return reactivateServiceCore(input);
}
