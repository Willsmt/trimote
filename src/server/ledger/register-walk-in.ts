import { Prisma, type PaymentMethod } from "@prisma/client";

import { prisma } from "@/server/db/client";
import {
  allAmountsPositive,
  buildServiceItem,
  normalizeDescription,
  sumItems,
  type LedgerItemInput,
} from "./ledger-items";

/**
 * Núcleo do atendimento avulso / walk-in (005-financial-ledger, US3), testável com `ownerId`
 * explícito. Gera um `LedgerEntry` de receita (INCOME/WALK_IN) com itens, SEM `bookingId` — não passa
 * pela agenda/exclusion constraint (não reserva horário). O cliente pode ser cadastrado (`clientId`),
 * nome livre (`clientName`) ou anônimo (nenhum) — FR-009.
 *
 * Ordem de verificação (curto-circuito; nenhuma recusa escreve nada):
 *   no_items → (por item) service_not_found / invalid_amount / invalid_description → invalid_amount
 *   (positividade) → client_not_found → create LedgerEntry + itens
 */

export interface WalkInItemInput {
  /** Serviço do catálogo (snapshot do preço) ou ausente para item manual. */
  serviceId?: string;
  description: string;
  /** Obrigatório para item manual; ignorado para item de serviço (usa o snapshot). */
  amount?: number;
}

export interface RegisterWalkInInput {
  /** OWNER que registra (createdBy — auditoria). */
  ownerId: string;
  items: WalkInItemInput[];
  /** Instante da captura (FR-017); default agora. */
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
  /** Cliente cadastrado (opcional). */
  clientId?: string;
  /** Nome livre do walk-in anônimo (opcional). */
  clientName?: string;
}

export type RegisterWalkInReason =
  | "no_items"
  | "invalid_amount"
  | "invalid_description"
  | "service_not_found"
  | "client_not_found";

export type RegisterWalkInResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: RegisterWalkInReason };

export async function registerWalkInForOwner(
  input: RegisterWalkInInput,
): Promise<RegisterWalkInResult> {
  // Receita exige ao menos um item.
  if (input.items.length === 0) {
    return { ok: false, reason: "no_items" };
  }

  const items: LedgerItemInput[] = [];
  // businessId derivado do serviço; para walk-in só-manual, resolve a barbearia única do MVP (D8).
  let businessId: string | null = null;

  for (const item of input.items) {
    if (item.serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: item.serviceId },
        select: { id: true, name: true, price: true, businessId: true },
      });
      if (!service) {
        return { ok: false, reason: "service_not_found" };
      }
      businessId ??= service.businessId;
      items.push(
        buildServiceItem({
          serviceId: service.id,
          description: item.description || service.name,
          price: service.price,
        }),
      );
    } else {
      if (item.amount == null) {
        return { ok: false, reason: "invalid_amount" };
      }
      // Item manual sem descrição não identifica a receita — rejeita e persiste sem espaços nas pontas.
      const description = normalizeDescription(item.description);
      if (description === null) {
        return { ok: false, reason: "invalid_description" };
      }
      items.push({
        serviceId: null,
        description,
        amount: new Prisma.Decimal(item.amount),
      });
    }
  }

  if (!allAmountsPositive(items)) {
    return { ok: false, reason: "invalid_amount" };
  }

  if (input.clientId) {
    const client = await prisma.user.findUnique({
      where: { id: input.clientId },
      select: { id: true },
    });
    if (!client) {
      return { ok: false, reason: "client_not_found" };
    }
  }

  if (businessId == null) {
    const shop = await prisma.business.findFirstOrThrow({ select: { id: true } });
    businessId = shop.id;
  }

  const amount = sumItems(items);
  const occurredAt = input.occurredAt ?? new Date();

  // Nested create é atômico (itens criados junto do lançamento); não há segunda operação.
  const entry = await prisma.ledgerEntry.create({
    data: {
      businessId,
      type: "INCOME",
      origin: "WALK_IN",
      amount,
      occurredAt,
      description: input.clientName ? `Atendimento avulso — ${input.clientName}` : "Atendimento avulso",
      paymentMethod: input.paymentMethod ?? null,
      bookingId: null,
      clientId: input.clientId ?? null,
      clientName: input.clientName ?? null,
      createdBy: input.ownerId,
      items: {
        create: items.map((it) => ({
          serviceId: it.serviceId,
          description: it.description,
          amount: it.amount,
        })),
      },
    },
    select: { id: true },
  });

  return { ok: true, ledgerEntryId: entry.id };
}
