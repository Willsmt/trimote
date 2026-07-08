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
  // Escopo por negócio (007, issue #6): o serviço só é mutável dentro do negócio ATIVO do dono; o
  // businessId vem do vínculo da sessão, nunca do input.
  const { businessId } = await requireOwner();
  return updateServiceCore({ businessId, ...input });
}
