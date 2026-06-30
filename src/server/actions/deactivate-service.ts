"use server";

import { requireOwner } from "@/server/auth/owner";
import { deactivateService as deactivateServiceCore, type ServiceMutationResult } from "@/server/owner/services";

/** Server Action: desativa (soft delete) um serviço (US1 / FR-005). Exige OWNER. */
export async function deactivateService(input: {
  serviceId: string;
}): Promise<ServiceMutationResult> {
  await requireOwner();
  return deactivateServiceCore(input);
}
