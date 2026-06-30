"use server";

import { requireOwner } from "@/server/auth/owner";
import { updateService as updateServiceCore, type ServiceMutationResult } from "@/server/owner/services";

/** Server Action: edita um serviço (US1). Exige OWNER. */
export async function updateService(input: {
  serviceId: string;
  name?: string;
  price?: string;
  durationMinutes?: number;
}): Promise<ServiceMutationResult> {
  await requireOwner();
  return updateServiceCore(input);
}
