import { prisma } from "@/server/db/client";

/**
 * Núcleo da remoção de dono pelo ADMIN (issue #31), irmã de promoteOwnerForAdmin. Remove o vínculo
 * BusinessMember (unlink puro — hard delete, sem soft-delete/auditoria nesta fase; auditoria = #32).
 * NÃO toca User.role (posse vive no vínculo; "rebaixar Role" é fantasma). Autorização é da ACTION
 * (requireAdmin); o core recebe businessId legitimamente (ADMIN opera qualquer negócio).
 *
 * Guard de último-owner OBRIGATÓRIO: um negócio nunca pode ficar sem dono. A corrida de dois removes
 * simultâneos é fechada por advisory xact lock por businessId (padrão da #27), na ordem lock → count
 * → delete, dentro de uma transação interativa.
 *
 * Sem oráculo cross-tenant: um membershipId que existe em OUTRO negócio devolve membership_not_found
 * (nunca revela que existe alhures).
 */

export interface RemoveOwnerInput {
  businessId: string;
  membershipId: string;
}

export type RemoveOwnerReason = "business_not_found" | "membership_not_found" | "last_owner";

export type RemoveOwnerResult = { ok: true } | { ok: false; reason: RemoveOwnerReason };

export async function removeOwnerForAdmin(input: RemoveOwnerInput): Promise<RemoveOwnerResult> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { id: true },
  });
  if (!business) {
    return { ok: false, reason: "business_not_found" };
  }

  return prisma.$transaction(async (tx): Promise<RemoveOwnerResult> => {
    // 1) Serializa por negócio na ordem lock → count → delete (padrão #27): dois removes concorrentes
    //    no MESMO negócio esperam aqui, e o segundo conta o resultado do primeiro já commitado.
    //    $executeRaw (não $queryRaw): pg_advisory_xact_lock retorna void. Chave única = hashtext do
    //    businessId (cuid → int); o lock solta no commit/rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.businessId}))`;

    // 2) Membership ESCOPADO ao negócio (anti-oráculo cross-tenant): só "existe" se pertence a ESTE
    //    negócio e é OWNER. "Não existe" e "existe em outro negócio" caem no MESMO membership_not_found,
    //    sem revelar qual. Recusa do alvo vem ANTES do last_owner.
    const membership = await tx.businessMember.findFirst({
      where: { id: input.membershipId, businessId: input.businessId, role: "OWNER" },
      select: { id: true },
    });
    if (!membership) {
      return { ok: false, reason: "membership_not_found" };
    }

    // 3) Invariante do último-owner: um negócio nunca fica sem dono. Count escopado e explícito em role
    //    (correto no dia que houver outro BusinessRole — não conta não-owner como se sustentasse a posse).
    const owners = await tx.businessMember.count({
      where: { businessId: input.businessId, role: "OWNER" },
    });
    if (owners <= 1) {
      return { ok: false, reason: "last_owner" };
    }

    // 4) Unlink puro (hard delete). deleteMany escopado (id + businessId) é belt-and-suspenders sobre a
    //    validação acima — nunca apaga vínculo de outro negócio mesmo sob id colidido.
    await tx.businessMember.deleteMany({
      where: { id: input.membershipId, businessId: input.businessId },
    });
    return { ok: true };
  });
}
