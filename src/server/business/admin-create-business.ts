import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { isValidSlugFormat, isReservedSlug } from "./reserved-slugs";

/**
 * Núcleo da criação de negócio pelo ADMIN (007, US1). Valida o slug no SERVIDOR (formato URL-safe,
 * reservados e unicidade — Princípio I / FR-023) e cria o `Business` com auditoria (`createdBy`).
 * `adminId` é injetado pela Server Action (= requireAdmin().id), nunca do input.
 *
 * Ordem de verificação: invalid_slug → slug_reserved → (create) slug_taken (corrida — @unique).
 */

export interface CreateBusinessInput {
  adminId: string;
  name: string;
  slug: string;
  timeZone: string;
  segment?: string;
}

export type CreateBusinessReason = "invalid_slug" | "slug_reserved" | "slug_taken";

export type CreateBusinessResult =
  | { ok: true; businessId: string }
  | { ok: false; reason: CreateBusinessReason };

export async function createBusinessForAdmin(
  input: CreateBusinessInput,
): Promise<CreateBusinessResult> {
  if (!isValidSlugFormat(input.slug)) {
    return { ok: false, reason: "invalid_slug" };
  }
  if (isReservedSlug(input.slug)) {
    return { ok: false, reason: "slug_reserved" };
  }

  try {
    const business = await prisma.business.create({
      data: {
        name: input.name,
        slug: input.slug,
        timezone: input.timeZone,
        segment: input.segment ?? "barbershop",
        createdBy: input.adminId,
      },
      select: { id: true },
    });
    return { ok: true, businessId: business.id };
  } catch (error) {
    // Unicidade do slug garantida no banco (@unique). P2002 = violação sob concorrência (Princípio II).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "slug_taken" };
    }
    throw error;
  }
}
