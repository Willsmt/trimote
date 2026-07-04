import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";

/**
 * Núcleo do histórico dos próprios gastos do cliente (006-financial-reports, US5). LEITURA PURA.
 * Só RECEITAS ATIVAS em que o usuário é o cliente (`clientId = userId`) — nunca despesas, lançamentos
 * de outros clientes, anônimos (`clientId = null`) nem inativos (FR-020). Mesmo keyset da listagem
 * do OWNER: `(occurredAt, id)` desc, `take = pageSize + 1`.
 *
 * O `userId` é imposto pela Server Action a partir da SESSÃO (nunca do input — FR-021).
 */

export interface ClientHistoryCursor {
  occurredAt: Date;
  id: string;
}

export interface ClientHistoryInput {
  userId: string;
  cursor?: ClientHistoryCursor;
  pageSize?: number;
}

export interface ClientHistoryRow {
  id: string;
  occurredAt: Date;
  description: string;
  amount: Prisma.Decimal;
  /** Nome do negócio do item (007, US5): a conta é global; cada item identifica seu negócio. */
  businessName: string;
  items: { description: string; amount: Prisma.Decimal }[];
}

export interface ClientHistoryResult {
  rows: ClientHistoryRow[];
  nextCursor: ClientHistoryCursor | null;
}

const DEFAULT_PAGE_SIZE = 10;

export async function listClientHistory(input: ClientHistoryInput): Promise<ClientHistoryResult> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  // Cursor em `Date` (ms) vs `Timestamptz(6)`: seguro porque todos os writes da F005 usam `new Date()`.
  const base: Prisma.LedgerEntryWhereInput = {
    clientId: input.userId,
    type: "INCOME",
    isActive: true,
  };
  const where: Prisma.LedgerEntryWhereInput = input.cursor
    ? {
        AND: [
          base,
          {
            OR: [
              { occurredAt: { lt: input.cursor.occurredAt } },
              { occurredAt: input.cursor.occurredAt, id: { lt: input.cursor.id } },
            ],
          },
        ],
      }
    : base;

  const rows = await prisma.ledgerEntry.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: {
      id: true,
      occurredAt: true,
      description: true,
      amount: true,
      business: { select: { name: true } },
      items: { select: { description: true, amount: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null;

  return {
    rows: page.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      description: r.description,
      amount: r.amount,
      businessName: r.business.name,
      items: r.items,
    })),
    nextCursor,
  };
}
