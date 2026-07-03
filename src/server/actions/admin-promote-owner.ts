"use server";

import { requireAdmin } from "@/server/auth/admin";
import {
  promoteOwnerForAdmin,
  type PromoteOwnerResult,
} from "@/server/business/admin-promote-owner";

/**
 * Server Action de promoção de dono (007, US1). Exige ADMIN (requireAdmin, FR-005); o autor deriva da
 * sessão. Só promove a OWNER (o core não tem parâmetro de role); NÃO escreve User.role.
 */
export async function promoteOwner(input: {
  businessId: string;
  email: string;
}): Promise<PromoteOwnerResult> {
  const admin = await requireAdmin();
  return promoteOwnerForAdmin({
    adminId: admin.id,
    businessId: input.businessId,
    email: input.email,
  });
}
