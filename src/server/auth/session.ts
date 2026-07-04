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

/** Estado de navegação derivado da sessão: visitante (null) ou autenticado com papel + posse atuais. */
export type NavSession =
  | { user: null; role: null; isOwner: false }
  | { user: NavUser; role: Role | null; isOwner: boolean };

/**
 * Lê a sessão para decidir a NAVEGAÇÃO (003-nav-session; atualizado na F007). Tudo do BANCO por
 * requisição: `role` (papel de plataforma, p/ o link ADMIN) e `isOwner` = tem ≥1 vínculo OWNER
 * (BusinessMember) — a posse deixou de ser um papel global (F007/D4). É leitura só p/ EXIBIÇÃO: NÃO
 * decide autorização; a barreira real continua em `requireAdmin`/`requireOwner`. Sem sessão → visitante.
 */
export async function getNavSession(): Promise<NavSession> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return { user: null, role: null, isOwner: false };
  }

  const [record, ownerMemberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { role: true } }),
    prisma.businessMember.count({ where: { userId: user.id, role: "OWNER" } }),
  ]);

  return { user, role: record?.role ?? null, isOwner: ownerMemberships > 0 };
}
