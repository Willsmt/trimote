"use server";

import { requireAdmin } from "@/server/auth/admin";
import {
  createBusinessForAdmin,
  type CreateBusinessResult,
} from "@/server/business/admin-create-business";

/**
 * Server Action de criação de negócio (007, US1). Exige ADMIN (requireAdmin, FR-005); o autor deriva
 * da sessão. NÃO escreve User.role. Delega ao core (que valida o slug no servidor).
 */
export async function createBusiness(input: {
  name: string;
  slug: string;
  timeZone: string;
  segment?: string;
}): Promise<CreateBusinessResult> {
  const admin = await requireAdmin();
  return createBusinessForAdmin({
    adminId: admin.id,
    name: input.name,
    slug: input.slug,
    timeZone: input.timeZone,
    segment: input.segment,
  });
}
