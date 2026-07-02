import { prisma } from "@/server/db/client";

/**
 * Núcleo da correção de lançamento por soft delete (005-financial-ledger, US5). Marca o lançamento
 * inteiro como inativo (`isActive=false`) — a ÚNICA forma de correção (FR-015): nunca hard delete
 * nem estorno. NÃO toca `Booking.status`: inativar um lançamento de origem BOOKING não reabre o
 * agendamento (FR-016).
 *
 * Ordem de verificação (curto-circuito): entry_not_found → already_inactive → update(isActive=false).
 */

export interface DeactivateLedgerEntryInput {
  ledgerEntryId: string;
}

export type DeactivateLedgerEntryReason = "entry_not_found" | "already_inactive";

export type DeactivateLedgerEntryResult =
  | { ok: true }
  | { ok: false; reason: DeactivateLedgerEntryReason };

export async function deactivateLedgerEntryForOwner(
  input: DeactivateLedgerEntryInput,
): Promise<DeactivateLedgerEntryResult> {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: input.ledgerEntryId },
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
