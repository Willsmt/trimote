import { getServerSession } from "next-auth";

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
