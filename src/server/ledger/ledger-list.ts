import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { periodBoundsInZone, type Granularity } from "@/domain/time";

/**
 * Núcleo do razão paginado do OWNER (006-financial-reports, US3). LEITURA PURA. `findMany` normal
 * (sem SQL cru — não há bucketização): filtros combináveis em conjunção e paginação KEYSET por
 * `(occurredAt, id)` desc, com `take = pageSize + 1` para detectar `hasMore` sem `COUNT`. Inativos
 * ausentes por padrão (FR-015).
 */

export interface LedgerCursor {
  occurredAt: Date;
  id: string;
}

export interface LedgerListFilter {
  period?: { granularity: Granularity; referenceLocalDate: string };
  type?: "INCOME" | "EXPENSE";
  origin?: "BOOKING" | "WALK_IN" | "EXPENSE";
  paymentMethod?: "CASH" | "PIX" | "CARD" | "ONLINE" | "OTHER" | "UNSET"; // UNSET → null
  category?: string | "UNSET"; // "UNSET" → null
  includeInactive?: boolean; // default false
}

export interface LedgerListInput {
  barbershopId: string;
  timeZone: string;
  filter: LedgerListFilter;
  cursor?: LedgerCursor;
  pageSize?: number;
}

export interface LedgerListRow {
  id: string;
  occurredAt: Date;
  type: "INCOME" | "EXPENSE";
  origin: "BOOKING" | "WALK_IN" | "EXPENSE";
  description: string;
  paymentMethod: "CASH" | "PIX" | "CARD" | "ONLINE" | "OTHER" | null;
  amount: Prisma.Decimal;
  isActive: boolean;
  items: { description: string; amount: Prisma.Decimal }[];
}

export interface LedgerListResult {
  rows: LedgerListRow[];
  nextCursor: LedgerCursor | null;
}

const DEFAULT_PAGE_SIZE = 10;

/** Filtro base (barbearia + isActive + tipo/origem/forma/categoria/período), em conjunção. */
function buildBaseWhere(input: LedgerListInput): Prisma.LedgerEntryWhereInput {
  const f = input.filter;
  const where: Prisma.LedgerEntryWhereInput = { barbershopId: input.barbershopId };

  if (!f.includeInactive) where.isActive = true;
  if (f.type) where.type = f.type;
  if (f.origin) where.origin = f.origin;
  if (f.paymentMethod) where.paymentMethod = f.paymentMethod === "UNSET" ? null : f.paymentMethod;
  if (f.category !== undefined) where.category = f.category === "UNSET" ? null : f.category;
  if (f.period) {
    const { startUtc, endUtc } = periodBoundsInZone(
      f.period.referenceLocalDate,
      f.period.granularity,
      input.timeZone,
    );
    where.occurredAt = { gte: startUtc, lt: endUtc };
  }
  return where;
}

export async function listLedgerForOwner(input: LedgerListInput): Promise<LedgerListResult> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const base = buildBaseWhere(input);

  // Keyset: página seguinte pega estritamente "abaixo" do cursor em (occurredAt desc, id desc).
  // O cursor viaja como JS `Date` (ms); `occurredAt` é `Timestamptz(6)`. É seguro comparar porque
  // todos os writes da F005 gravam `new Date()` (precisão de ms) — não há sub-ms no banco.
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
      type: true,
      origin: true,
      description: true,
      paymentMethod: true,
      amount: true,
      isActive: true,
      items: { select: { description: true, amount: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null;

  return { rows: page, nextCursor };
}
