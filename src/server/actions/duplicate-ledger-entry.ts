"use server";

import { requireOwner } from "@/server/auth/owner";
import {
  duplicateLedgerEntryForOwner,
  type DuplicateLedgerEntryResult,
} from "@/server/ledger/duplicate-ledger-entry";

/**
 * Server Action de duplicação de lançamento inativado (issue #11). Exige OWNER (`requireOwner`) e
 * delega ao core. Sem regra de negócio aqui. O `businessId` vem do vínculo da sessão, NUNCA do
 * input; o autor do novo lançamento é o dono da sessão.
 */
export async function duplicateLedgerEntry(input: {
  ledgerEntryId: string;
}): Promise<DuplicateLedgerEntryResult> {
  const owner = await requireOwner();
  return duplicateLedgerEntryForOwner({
    businessId: owner.businessId,
    ownerId: owner.user.id,
    ledgerEntryId: input.ledgerEntryId,
  });
}
