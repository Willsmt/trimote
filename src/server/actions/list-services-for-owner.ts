"use server";

import { requireOwner } from "@/server/auth/owner";
import { listServicesForOwner as listCore, type OwnerServiceItem } from "@/server/owner/services";

/** Server Action: lista serviços do dono, incluindo inativos (US1). Exige OWNER. */
export async function listServicesForOwner(): Promise<OwnerServiceItem[]> {
  const { businessId } = await requireOwner();
  return listCore({ businessId });
}
