import { prisma } from "@/server/db/client";

/**
 * Troca o NEGÓCIO ATIVO da sessão (007, US2). Valida que o usuário é MEMBRO OWNER do negócio alvo
 * (revalidação — nunca confia no client) e, só então, grava `Session.activeBusinessId`. É a única
 * escrita desse estado; a leitura/derivação fica em active-business.ts.
 */

export type SwitchBusinessReason = "not_member";

export type SwitchBusinessResult = { ok: true } | { ok: false; reason: SwitchBusinessReason };

export async function switchActiveBusiness(input: {
  userId: string;
  sessionToken: string;
  businessId: string;
}): Promise<SwitchBusinessResult> {
  const membership = await prisma.businessMember.findUnique({
    where: { userId_businessId: { userId: input.userId, businessId: input.businessId } },
    select: { role: true },
  });
  if (!membership || membership.role !== "OWNER") {
    return { ok: false, reason: "not_member" };
  }

  await prisma.session.update({
    where: { sessionToken: input.sessionToken },
    data: { activeBusinessId: input.businessId },
  });
  return { ok: true };
}
