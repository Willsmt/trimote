import { Role } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { getCurrentUser, UnauthorizedError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/auth/owner";

/**
 * Guard de plataforma (007, FR-004). ADMIN opera a plataforma (cria negócios, promove donos) — NÃO
 * opera negócios (isso exige vínculo OWNER; ver requireOwner). O papel é lido do BANCO a cada request
 * (nunca de cookie/JWT/input), estendendo a disciplina da F002. Distinto de requireOwner (membership).
 */
export async function requireAdmin(): Promise<{ id: string }> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new UnauthorizedError();
  }
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (record?.role !== Role.ADMIN) {
    throw new ForbiddenError("Acesso restrito ao administrador da plataforma.");
  }
  return { id: user.id };
}
