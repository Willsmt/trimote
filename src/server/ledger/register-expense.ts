import { Prisma, type PaymentMethod } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { normalizeDescription } from "./ledger-items";

/**
 * Núcleo da despesa (005-financial-ledger, US4), testável com `ownerId` explícito. Gera um
 * `LedgerEntry` de saída (EXPENSE/EXPENSE) com descrição, categoria e valor — SEM itens e SEM
 * cliente. O valor é sempre positivo; o sinal de saída vem do `type` (FR-011).
 *
 * Ordem de verificação (curto-circuito): invalid_amount → invalid_description → create LedgerEntry
 * (sem itens).
 */

export interface RegisterExpenseInput {
  /** OWNER que registra (createdBy — auditoria). */
  ownerId: string;
  /** Valor da despesa; sempre > 0 (o sinal de saída vem do type EXPENSE — FR-011). */
  amount: number;
  description: string;
  category?: string;
  /** Instante da captura (FR-017); default agora. */
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
}

export type RegisterExpenseReason = "invalid_amount" | "invalid_description";

export type RegisterExpenseResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: RegisterExpenseReason };

export async function registerExpenseForOwner(
  input: RegisterExpenseInput,
): Promise<RegisterExpenseResult> {
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.greaterThan(0)) {
    return { ok: false, reason: "invalid_amount" };
  }

  // Descrição em branco não identifica a saída — rejeita e persiste o valor sem espaços nas pontas.
  const description = normalizeDescription(input.description);
  if (description === null) {
    return { ok: false, reason: "invalid_description" };
  }

  // Barbearia única do MVP (D8) — despesa não tem serviço de onde derivar o businessId.
  const shop = await prisma.business.findFirstOrThrow({ select: { id: true } });
  const occurredAt = input.occurredAt ?? new Date();

  const entry = await prisma.ledgerEntry.create({
    data: {
      businessId: shop.id,
      type: "EXPENSE",
      origin: "EXPENSE",
      amount,
      occurredAt,
      description,
      category: input.category ?? null,
      paymentMethod: input.paymentMethod ?? null,
      bookingId: null,
      clientId: null,
      clientName: null,
      createdBy: input.ownerId,
    },
    select: { id: true },
  });

  return { ok: true, ledgerEntryId: entry.id };
}
