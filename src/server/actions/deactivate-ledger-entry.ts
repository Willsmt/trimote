"use server";

import { requireOwner } from "@/server/auth/owner";
import {
  deactivateLedgerEntryForOwner,
  type DeactivateLedgerEntryResult,
} from "@/server/ledger/deactivate-ledger-entry";

/**
 * Server Action de correção por soft delete (005, US5). Exige OWNER (autorização por ROLE —
 * `requireOwner`, FR-018) e delega ao core. Sem regra de negócio aqui.
 */
export async function deactivateLedgerEntry(input: {
  ledgerEntryId: string;
}): Promise<DeactivateLedgerEntryResult> {
  // Escopo por negócio (007, issue #6): só inativa lançamento do negócio ATIVO; businessId do vínculo.
  const { businessId } = await requireOwner();
  return deactivateLedgerEntryForOwner({ businessId, ledgerEntryId: input.ledgerEntryId });
}
