"use server";

import { requireAdmin } from "@/server/auth/admin";
import {
  removeOwnerForAdmin,
  type RemoveOwnerResult,
} from "@/server/business/admin-remove-owner";

/**
 * Server Action de remoção de dono (issue #31), inversa de promoteOwner. Exige ADMIN (requireAdmin,
 * FR-005) — a barreira de autorização vive aqui, no servidor, a cada request. O core recebe o
 * businessId legitimamente (ADMIN opera qualquer negócio; não é o caso anti-IDOR do OWNER). Unlink
 * puro, sem auditoria nesta fase (#32) — por isso o autor da sessão não é propagado ao core.
 */
export async function removeOwner(input: {
  businessId: string;
  membershipId: string;
}): Promise<RemoveOwnerResult> {
  await requireAdmin();
  return removeOwnerForAdmin({
    businessId: input.businessId,
    membershipId: input.membershipId,
  });
}
