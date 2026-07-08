"use server";

import { requireOwner } from "@/server/auth/owner";
import { deactivateService as deactivateServiceCore, type ServiceMutationResult } from "@/server/owner/services";

/** Server Action: desativa (soft delete) um serviço (US1 / FR-005). Exige OWNER. */
export async function deactivateService(input: {
  serviceId: string;
}): Promise<ServiceMutationResult> {
  // Escopo por negócio (007, issue #6): só desativa serviço do negócio ATIVO; businessId do vínculo.
  const { businessId } = await requireOwner();
  return deactivateServiceCore({ businessId, ...input });
}
