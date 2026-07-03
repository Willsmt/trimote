"use server";

import { requireOwner } from "@/server/auth/owner";
import { getOwnerBusinessId } from "@/server/owner/business";
import { listServicesForOwner as listCore, type OwnerServiceItem } from "@/server/owner/services";

/** Server Action: lista serviços do dono, incluindo inativos (US1). Exige OWNER. */
export async function listServicesForOwner(): Promise<OwnerServiceItem[]> {
  await requireOwner();
  const businessId = await getOwnerBusinessId();
  return listCore({ businessId });
}
