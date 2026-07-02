"use server";

import { getCurrentUser, UnauthorizedError } from "@/server/auth/session";
import { listClientHistory, type ClientHistoryCursor } from "@/server/ledger/client-history";

/**
 * Server Action do histórico do próprio cliente (006, US5). Exige apenas SESSÃO autenticada (deriva
 * o usuário da sessão no servidor — NÃO `requireOwner`, FR-019; mesmo padrão de `requireOwner` que lê
 * `getCurrentUser`). O `clientId` do filtro é SEMPRE o usuário da sessão; a assinatura NÃO aceita
 * `clientId` (nem qualquer identificador de cliente) do input (FR-021). Serializa Decimal→string e
 * datas→ISO na fronteira (D5).
 */

export interface ClientHistoryRowDTO {
  id: string;
  occurredAtIso: string;
  description: string;
  amount: string;
  items: { description: string; amount: string }[];
}

export interface ClientHistoryPageDTO {
  rows: ClientHistoryRowDTO[];
  nextCursor: { occurredAtIso: string; id: string } | null;
}

function parseCursor(
  input: { occurredAtIso: string; id: string } | undefined,
): ClientHistoryCursor | undefined {
  if (!input || typeof input.id !== "string" || typeof input.occurredAtIso !== "string") return undefined;
  const occurredAt = new Date(input.occurredAtIso);
  if (Number.isNaN(occurredAt.getTime())) return undefined;
  return { occurredAt, id: input.id };
}

export async function listMyLedger(input: {
  cursor?: { occurredAtIso: string; id: string };
}): Promise<ClientHistoryPageDTO> {
  const user = await getCurrentUser();
  if (!user?.id) throw new UnauthorizedError();

  const result = await listClientHistory({
    userId: user.id,
    cursor: parseCursor(input.cursor),
  });

  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      occurredAtIso: r.occurredAt.toISOString(),
      description: r.description,
      amount: r.amount.toString(),
      items: r.items.map((it) => ({ description: it.description, amount: it.amount.toString() })),
    })),
    nextCursor: result.nextCursor
      ? { occurredAtIso: result.nextCursor.occurredAt.toISOString(), id: result.nextCursor.id }
      : null,
  };
}
