import { prisma } from "@/server/db/client";

/**
 * Núcleo da correção de lançamento por soft delete (005-financial-ledger, US5). Marca o lançamento
 * inteiro como inativo (`isActive=false`) — a ÚNICA forma de correção (FR-015): nunca hard delete
 * nem estorno. NÃO toca `Booking.status`: inativar um lançamento de origem BOOKING não reabre o
 * agendamento (FR-016).
 *
 * Escopo por negócio (007, issue #6): o lançamento é resolvido por `findFirst({ where: { id,
 * businessId } })` — nunca por `id` só. Um `ledgerEntryId` de outro negócio não é encontrado dentro
 * do negócio ativo e cai em `entry_not_found` (sem oráculo de existência cross-tenant). O
 * `businessId` vem do vínculo da sessão (via `requireOwner`), NUNCA do input.
 *
 * Ordem de verificação (curto-circuito): entry_not_found → already_inactive → update(isActive=false).
 */

export interface DeactivateLedgerEntryInput {
  /** Negócio ativo do dono (007) — derivado do vínculo da sessão pela action, NUNCA do input. */
  businessId: string;
  ledgerEntryId: string;
}

export type DeactivateLedgerEntryReason = "entry_not_found" | "already_inactive";

export type DeactivateLedgerEntryResult =
  | { ok: true }
  | { ok: false; reason: DeactivateLedgerEntryReason };

export async function deactivateLedgerEntryForOwner(
  input: DeactivateLedgerEntryInput,
): Promise<DeactivateLedgerEntryResult> {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: input.ledgerEntryId, businessId: input.businessId },
    select: { id: true, isActive: true },
  });

  if (!entry) {
    return { ok: false, reason: "entry_not_found" };
  }
  if (!entry.isActive) {
    return { ok: false, reason: "already_inactive" };
  }

  await prisma.ledgerEntry.update({
    where: { id: entry.id },
    data: { isActive: false },
  });

  return { ok: true };
}
