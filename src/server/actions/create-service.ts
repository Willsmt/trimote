"use server";

import { requireOwner } from "@/server/auth/owner";
import { createService as createServiceCore, type CreateServiceResult } from "@/server/owner/services";

/** Server Action: cria um serviço (US1). Exige OWNER (FR-001). */
export async function createService(input: {
  name: string;
  price: string;
  durationMinutes: number;
}): Promise<CreateServiceResult> {
  const { businessId } = await requireOwner();
  return createServiceCore({ businessId, ...input });
}
