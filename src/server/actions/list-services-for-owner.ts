"use server";

import { requireOwner } from "@/server/auth/owner";
import { getOwnerBarbershopId } from "@/server/owner/barbershop";
import { listServicesForOwner as listCore, type OwnerServiceItem } from "@/server/owner/services";

/** Server Action: lista serviços do dono, incluindo inativos (US1). Exige OWNER. */
export async function listServicesForOwner(): Promise<OwnerServiceItem[]> {
  await requireOwner();
  const barbershopId = await getOwnerBarbershopId();
  return listCore({ barbershopId });
}
