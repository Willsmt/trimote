"use server";

import type { PaymentMethod } from "@prisma/client";

import { requireOwner } from "@/server/auth/owner";
import {
  registerWalkInForOwner,
  type RegisterWalkInResult,
  type WalkInItemInput,
} from "@/server/ledger/register-walk-in";

/**
 * Server Action de atendimento avulso / walk-in (005, US3). Exige OWNER (autorização por ROLE —
 * `requireOwner`, FR-018); o autor deriva da sessão. Converte `occurredAt` ISO→Date e delega ao core.
 */
export async function registerWalkIn(input: {
  items: WalkInItemInput[];
  occurredAt?: string; // ISO 8601 (UTC)
  paymentMethod?: PaymentMethod;
  clientId?: string;
  clientName?: string;
}): Promise<RegisterWalkInResult> {
  const owner = await requireOwner();
  return registerWalkInForOwner({
    ownerId: owner.id,
    items: input.items,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    paymentMethod: input.paymentMethod,
    clientId: input.clientId,
    clientName: input.clientName,
  });
}
