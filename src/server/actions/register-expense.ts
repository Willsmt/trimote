"use server";

import type { PaymentMethod } from "@prisma/client";

import { requireOwner } from "@/server/auth/owner";
import {
  registerExpenseForOwner,
  type RegisterExpenseResult,
} from "@/server/ledger/register-expense";

/**
 * Server Action de despesa (005, US4). Exige OWNER (autorização por ROLE — `requireOwner`, FR-018);
 * o autor deriva da sessão. Converte `occurredAt` ISO→Date e delega ao core.
 */
export async function registerExpense(input: {
  amount: number;
  description: string;
  category?: string;
  occurredAt?: string; // ISO 8601 (UTC)
  paymentMethod?: PaymentMethod;
}): Promise<RegisterExpenseResult> {
  const owner = await requireOwner();
  return registerExpenseForOwner({
    ownerId: owner.id,
    amount: input.amount,
    description: input.description,
    category: input.category,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    paymentMethod: input.paymentMethod,
  });
}
