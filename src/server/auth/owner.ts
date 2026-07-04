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

/**
 * O usuário é dono de VÁRIOS negócios e ainda não escolheu o ativo. NÃO é falha de aplicação: é um
 * ESTADO DE UI. Continua sendo LANÇADO (as Server Actions dependem disso — não têm superfície para
 * renderizar um seletor e não podem operar sem negócio ativo), mas carrega as `options` (já
 * computadas por resolveActiveBusiness) para que as PÁGINAS de dono capturem e renderizem a tela de
 * seleção em vez de reconsultar o banco.
 */
export class NeedsBusinessSelectionError extends Error {
  readonly options: { businessId: string; name: string }[];
  constructor(options: { businessId: string; name: string }[] = [], message = "Selecione o negócio ativo.") {
    super(message);
    this.name = "NeedsBusinessSelectionError";
    this.options = options;
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
    throw new NeedsBusinessSelectionError(active.options);
  }
  // empty: não é membro OWNER de nenhum negócio (inclui CLIENT e ADMIN-sem-vínculo — FR-010).
  throw new ForbiddenError();
}
