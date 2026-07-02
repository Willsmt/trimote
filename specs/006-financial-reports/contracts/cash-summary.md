# Contract: Cash Summary + Breakdown (US1/US2)

Core de leitura das agregações do caixa e do breakdown de um período. SQL cru **tipado** e
**parametrizado** (`$queryRaw`), nunca `Prisma.groupBy`. Sem escrita.

## Core — `src/server/ledger/cash-summary.ts`

```ts
export type Granularity = "day" | "week" | "month" | "year";

export interface CashSummaryInput {
  barbershopId: string;              // escopo (single-shop MVP)
  timeZone: string;                  // Barbershop.timezone (parametrizado — nunca hardcode)
  granularity: Granularity;
  referenceLocalDate: string;        // 'YYYY-MM-DD' no fuso da barbearia (período visado)
}

export interface PaymentMethodBucket { key: "CASH"|"PIX"|"CARD"|"ONLINE"|"OTHER"|"UNSET"; amount: Prisma.Decimal; }
export interface CategoryBucket { key: string | null; amount: Prisma.Decimal; }   // null = "sem categoria"

export interface CashSummaryResult {
  period: { granularity: Granularity; startUtc: Date; endUtc: Date };
  income: Prisma.Decimal;            // COALESCE 0
  expense: Prisma.Decimal;          // COALESCE 0
  balance: Prisma.Decimal;          // income.minus(expense) — pode ser negativo
  incomeByPaymentMethod: PaymentMethodBucket[];
  expenseByCategory: CategoryBucket[];
}

export async function getCashSummaryForOwner(input: CashSummaryInput): Promise<CashSummaryResult>;
```

### Comportamento

1. Deriva `[startUtc, endUtc)` do período via `src/domain/time` (Luxon), no `timeZone` (D3). Semana
   ISO (segunda — D2).
2. `$queryRaw` tipado com filtro `barbershopId = $shop AND isActive = true AND occurredAt >= $start
   AND occurredAt < $end` (range → índice; D3/D7). Nunca função sobre `occurredAt` no WHERE.
3. Totais: `COALESCE(SUM(amount) FILTER (WHERE type='INCOME'), 0)` e idem `EXPENSE` (D4/D5).
4. Breakdown: `GROUP BY paymentMethod` sobre INCOME (null→`UNSET`) e `GROUP BY category` sobre
   EXPENSE (null preservado) (D6). `$tz`/limites são **parâmetros** (`Prisma.sql`), sem interpolação.
5. `balance = income.minus(expense)` em `Decimal`.

### Invariantes (testáveis)

- Σ `incomeByPaymentMethod.amount` == `income`; Σ `expenseByCategory.amount` == `expense` (SC-004).
- Período vazio ⇒ `income=expense=balance=0.00`, listas vazias, sem erro (SC-005).
- `isActive=false` nunca soma (SC-002).
- Lançamento 22h/23h local perto da virada UTC cai no período **local** (SC-003).

## Camada de apresentação (US1/US2)

- **Server Component** `src/app/owner/finance/page.tsx`: `requireOwner` (redirect padrão);
  resolve `barbershopId` + `timezone`; período default **mês corrente** (`todayInZone(now, tz)`),
  granularidade e navegação anterior/próximo via **searchParams** (server-rendered, sem action).
- Serializa `CashSummaryResult` → `CashSummaryDTO`/`BreakdownDTO` (Decimal→string, datas→ISO;
  rótulos pt-BR na UI). Sem gráficos (FR-026).
- Autorização: **OWNER** apenas (FR-022).
