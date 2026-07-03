import { getCurrentUser, UnauthorizedError } from "@/server/auth/session";
import { resolveActiveBusiness, readActiveBusinessHint } from "@/server/business/active-business";

/**
 * Guard de DONO (007, US3). Reescrito da F002: "ser dono" agora significa **ser membro OWNER do
 * negócio ATIVO** (fonte de verdade = BusinessMember), não um papel global. O `businessId` deriva do
 * vínculo da sessão — NUNCA do input (anti-IDOR, FR-013/FR-014). A verificação é sempre no servidor.
 */

/** Erro de autorização — usuário autenticado mas sem permissão (não é dono do negócio ativo). */
export class ForbiddenError extends Error {
  constructor(message = "Acesso restrito ao dono.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** O usuário é dono de VÁRIOS negócios e ainda não escolheu o ativo (a UI mostra o seletor). */
export class NeedsBusinessSelectionError extends Error {
  constructor(message = "Selecione o negócio ativo.") {
    super(message);
    this.name = "NeedsBusinessSelectionError";
  }
}

/**
 * Exige um dono do negócio ativo. Deriva o usuário da sessão e resolve o negócio ativo pelo vínculo
 * (revalidado por request). Retorna o `businessId`/`timeZone` para as operações de dono usarem — sem
 * jamais aceitar um id de negócio da entrada.
 */
export async function requireOwner(): Promise<{
  user: { id: string };
  businessId: string;
  timeZone: string;
}> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new UnauthorizedError();
  }
  const hint = await readActiveBusinessHint();
  const active = await resolveActiveBusiness(user.id, hint);
  if (active.state === "active") {
    return { user: { id: user.id }, businessId: active.businessId, timeZone: active.timeZone };
  }
  if (active.state === "needs_selection") {
    throw new NeedsBusinessSelectionError();
  }
  // empty: não é membro OWNER de nenhum negócio (inclui CLIENT e ADMIN-sem-vínculo — FR-010).
  throw new ForbiddenError();
}
