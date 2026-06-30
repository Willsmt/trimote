import { getServerSession } from "next-auth";
import type { Role } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { authOptions } from "./options";

/** Erro de autorização — usado quando uma ação exige sessão e não há usuário autenticado. */
export class UnauthorizedError extends Error {
  constructor(message = "Autenticação obrigatória.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Retorna o usuário autenticado da sessão (no servidor) ou null. */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/**
 * Retorna o usuário autenticado ou lança UnauthorizedError (FR-001).
 * O owner dos agendamentos deriva sempre da sessão no servidor — nunca de entrada do cliente.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new UnauthorizedError();
  }
  return user;
}

/** Usuário autenticado da sessão (no servidor) — campos usados pela navegação. */
type NavUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Estado de navegação derivado da sessão: visitante (null) ou autenticado com o seu papel atual. */
export type NavSession =
  | { user: null; role: null }
  | { user: NavUser; role: Role | null };

/**
 * Lê a sessão e o papel para decidir a NAVEGAÇÃO (003-nav-session, FR-003/FR-007/FR-009).
 *
 * O `role` é lido do BANCO por requisição — a MESMA fonte de verdade usada por `requireOwner`
 * (src/server/auth/owner.ts) — para refletir o papel atual e não um claim de sessão obsoleto após
 * promoção/rebaixamento. É leitura apenas para EXIBIÇÃO: NÃO decide autorização; a barreira real das
 * áreas restritas continua sendo `requireOwner` (FR-010/FR-011). Sem sessão, retorna visitante.
 */
export async function getNavSession(): Promise<NavSession> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return { user: null, role: null };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  return { user, role: record?.role ?? null };
}
