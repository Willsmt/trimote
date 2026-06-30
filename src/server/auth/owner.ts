import { Role } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { getCurrentUser, UnauthorizedError } from "@/server/auth/session";

/**
 * Guard de autorização do painel do dono (FR-001/Princípio I).
 *
 * A verificação é SEMPRE no servidor; barrar apenas na UI não basta. O `role` é lido do banco por
 * requisição (fonte de verdade), evitando depender de um claim de sessão potencialmente obsoleto
 * após uma promoção/rebaixamento (research.md D2).
 */

/** Erro de autorização — usuário autenticado mas sem permissão de dono. */
export class ForbiddenError extends Error {
  constructor(message = "Acesso restrito ao dono.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Garante que o usuário tem papel OWNER. Lança UnauthorizedError se o usuário não existe e
 * ForbiddenError se existe mas não é OWNER.
 */
export async function assertOwnerRole(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    throw new UnauthorizedError();
  }
  if (user.role !== Role.OWNER) {
    throw new ForbiddenError();
  }
}

/**
 * Exige uma sessão de dono. Deriva o usuário da sessão no servidor e valida o role no banco.
 * Reusado por todas as Server Actions de gestão e pela página do painel. Retorna o usuário dono.
 */
export async function requireOwner() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new UnauthorizedError();
  }
  await assertOwnerRole(user.id);
  return user;
}
