import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";

/**
 * Núcleo da promoção de dono pelo ADMIN (007, US1). Busca um usuário JÁ existente por email exato e
 * cria o vínculo `BusinessMember` com papel **OWNER** (nunca ADMIN — sem escalada vertical) e
 * auditoria (`createdBy`). NÃO escreve `User.role` do promovido: a posse vive no vínculo (D4/D6).
 *
 * Ordem: business_not_found → user_not_found → (create) already_member (@@unique userId+businessId).
 */

export interface PromoteOwnerInput {
  adminId: string;
  businessId: string;
  email: string;
}

export type PromoteOwnerReason = "business_not_found" | "user_not_found" | "already_member";

export type PromoteOwnerResult =
  | { ok: true; membershipId: string }
  | { ok: false; reason: PromoteOwnerReason };

export async function promoteOwnerForAdmin(input: PromoteOwnerInput): Promise<PromoteOwnerResult> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { id: true },
  });
  if (!business) {
    return { ok: false, reason: "business_not_found" };
  }

  // Busca EXATA por email — sem criação implícita (a pessoa precisa ter conta antes; FR-008).
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) {
    return { ok: false, reason: "user_not_found" };
  }

  try {
    const membership = await prisma.businessMember.create({
      data: {
        userId: user.id,
        businessId: business.id,
        role: "OWNER",
        createdBy: input.adminId,
      },
      select: { id: true },
    });
    return { ok: true, membershipId: membership.id };
  } catch (error) {
    // Vínculo duplicado é impossível no dado (@@unique userId+businessId); P2002 = já é membro.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "already_member" };
    }
    throw error;
  }
}
