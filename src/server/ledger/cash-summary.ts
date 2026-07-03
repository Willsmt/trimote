import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { periodBoundsInZone, type Granularity } from "@/domain/time";

/**
 * Núcleo do caixa + breakdown do balancete (006-financial-reports, US1/US2), testável com
 * `businessId`/`timeZone` explícitos. LEITURA PURA — nenhuma escrita.
 *
 * Bucketização por RANGE em UTC: os limites `[startUtc, endUtc)` do período são derivados no fuso da
 * barbearia por `periodBoundsInZone` (Luxon — a fronteira única de fuso) e o WHERE compara
 * `occurredAt` a esses escalares. É range sobre a coluna nua, então usa o índice
 * `(businessId, occurredAt)` da F005; NÃO há `AT TIME ZONE`/`date_trunc` na query nem função sobre
 * `occurredAt` (Clarify FR-003). Só lançamentos ativos contam (FR-004). Dinheiro em `Prisma.Decimal`,
 * nunca float (FR-023); `$queryRaw` TIPADO e PARAMETRIZADO (`Prisma.sql`), nunca interpolado.
 */

export type { Granularity };

export interface CashSummaryInput {
  businessId: string;
  timeZone: string;
  granularity: Granularity;
  /** 'YYYY-MM-DD' no fuso da barbearia — qualquer dia dentro do período visado. */
  referenceLocalDate: string;
}

export interface PaymentMethodBucket {
  key: "CASH" | "PIX" | "CARD" | "ONLINE" | "OTHER" | "UNSET";
  amount: Prisma.Decimal;
}
export interface CategoryBucket {
  key: string | null; // null = "sem categoria"
  amount: Prisma.Decimal;
}

export interface CashSummaryResult {
  period: { granularity: Granularity; startUtc: Date; endUtc: Date };
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  balance: Prisma.Decimal;
  incomeByPaymentMethod: PaymentMethodBucket[];
  expenseByCategory: CategoryBucket[];
}

interface TotalsRow {
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
}
interface BucketRow {
  key: string | null;
  amount: Prisma.Decimal;
}

export async function getCashSummaryForOwner(input: CashSummaryInput): Promise<CashSummaryResult> {
  const { startUtc, endUtc } = periodBoundsInZone(
    input.referenceLocalDate,
    input.granularity,
    input.timeZone,
  );

  // Filtro comum (range → índice; só ativos; escopo da barbearia). Valores como PARÂMETROS.
  const where = Prisma.sql`
    "businessId" = ${input.businessId}
    AND "isActive" = true
    AND "occurredAt" >= ${startUtc}
    AND "occurredAt" < ${endUtc}`;

  // Totais numa passada: soma condicional por tipo, COALESCE 0 para período vazio (FR-004/005).
  const totalsRows = await prisma.$queryRaw<TotalsRow[]>(Prisma.sql`
    SELECT
      COALESCE(SUM("amount") FILTER (WHERE "type" = 'INCOME'), 0) AS income,
      COALESCE(SUM("amount") FILTER (WHERE "type" = 'EXPENSE'), 0) AS expense
    FROM "LedgerEntry"
    WHERE ${where}`);

  // Breakdown de entradas por forma de pagamento (null → UNSET — FR-007).
  const pmRows = await prisma.$queryRaw<BucketRow[]>(Prisma.sql`
    SELECT "paymentMethod"::text AS key, SUM("amount") AS amount
    FROM "LedgerEntry"
    WHERE ${where} AND "type" = 'INCOME'
    GROUP BY "paymentMethod"`);

  // Breakdown de saídas por categoria (null preservado = "sem categoria" — FR-008).
  const catRows = await prisma.$queryRaw<BucketRow[]>(Prisma.sql`
    SELECT "category" AS key, SUM("amount") AS amount
    FROM "LedgerEntry"
    WHERE ${where} AND "type" = 'EXPENSE'
    GROUP BY "category"`);

  const income = totalsRows[0].income;
  const expense = totalsRows[0].expense;

  return {
    period: { granularity: input.granularity, startUtc, endUtc },
    income,
    expense,
    balance: income.minus(expense),
    incomeByPaymentMethod: pmRows.map((r) => ({
      key: (r.key ?? "UNSET") as PaymentMethodBucket["key"],
      amount: r.amount,
    })),
    expenseByCategory: catRows.map((r) => ({ key: r.key, amount: r.amount })),
  };
}
