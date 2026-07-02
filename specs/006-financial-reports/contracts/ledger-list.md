# Contract: Ledger List + Inactivate (US3/US4)

Listagem paginada por keyset do razão do OWNER, com filtros combináveis e expansão de itens. A
inativação por linha **reutiliza** a action da F005 sem mudança.

## Core — `src/server/ledger/ledger-list.ts`

```ts
export interface LedgerCursor { occurredAt: Date; id: string; }

export interface LedgerListFilter {
  period?: { granularity: "day"|"week"|"month"|"year"; referenceLocalDate: string };
  type?: "INCOME" | "EXPENSE";
  origin?: "BOOKING" | "WALK_IN" | "EXPENSE";
  paymentMethod?: "CASH"|"PIX"|"CARD"|"ONLINE"|"OTHER"|"UNSET";  // UNSET → null
  category?: string | "UNSET";                                   // UNSET → null
  includeInactive?: boolean;                                     // default false
}

export interface LedgerListInput {
  barbershopId: string;
  timeZone: string;          // só para derivar o range do filtro de período (D3)
  filter: LedgerListFilter;
  cursor?: LedgerCursor;     // ausente = primeira página
  pageSize?: number;         // default 10
}

export interface LedgerListRow {
  id: string; occurredAt: Date; type: "INCOME"|"EXPENSE";
  origin: "BOOKING"|"WALK_IN"|"EXPENSE"; description: string;
  paymentMethod: "CASH"|"PIX"|"CARD"|"ONLINE"|"OTHER"|null;
  amount: Prisma.Decimal; isActive: boolean;
  items: { description: string; amount: Prisma.Decimal }[];
}

export interface LedgerListResult {
  rows: LedgerListRow[];                        // até pageSize
  nextCursor: LedgerCursor | null;              // null = fim
}

export async function listLedgerForOwner(input: LedgerListInput): Promise<LedgerListResult>;
```

### Comportamento

1. `where`: `barbershopId`; `isActive: true` (ou `{}` se `includeInactive`); mais filtros em
   conjunção (D9). `period` → range `occurredAt` (D3). `UNSET` → `null`.
2. Keyset (D8): sem cursor na 1ª página; com cursor,
   `(occurredAt < cur.occurredAt) OR (occurredAt = cur.occurredAt AND id < cur.id)`.
   `orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]`. `take: pageSize + 1`.
3. Se vierem `pageSize+1`, `hasMore` e `nextCursor` = 11ª linha; retorna as 10 primeiras.
4. `select` enxuto + `include items` direto (D10).

### Invariantes (testáveis)

- Ordem mais-recente-primeiro; keyset **não repete nem pula** com `occurredAt` empatado (SC-006).
- Filtros em conjunção retornam só o que casa **tudo** (SC-007).
- Inativos ausentes por padrão; sob `includeInactive` aparecem com `isActive=false` (SC-008) e
  **nunca** contam em total (o caixa ignora inativos sempre).

## Server Action — `src/server/actions/list-ledger.ts`

```ts
export async function listLedger(input: {
  filter: LedgerListFilter;
  cursor?: { occurredAtIso: string; id: string };
}): Promise<LedgerPageDTO>;   // rows (Decimal→string, datas→ISO) + nextCursor serializado
```

- `requireOwner()` (FR-022); resolve `barbershopId` + `timezone`; valida filtro/cursor (whitelist);
  delega ao core; serializa para `LedgerPageDTO` (D5).

## Inativação (US4) — REUSO da F005 (sem mudança — D13)

- A ilha client chama a **mesma** `deactivateLedgerEntry({ ledgerEntryId })` da F005 em cada linha
  **ativa**. Assinatura, `requireOwner` interno e reasons (`entry_not_found`/`already_inactive`)
  **inalterados**. Após sucesso, a UI recarrega a página atual (e o caixa reflete — FR-017).
- **Nenhum** arquivo de core/action da F005 é editado. Se algo exigir mudança lá → **PARAR e
  reportar** (Princípio VI).

## Camada de apresentação (US3/US4)

- **Server Component** render inicial (1ª página) + **ilha client** `ledger-browser.tsx`: estado de
  filtros, "carregar mais" (chama `listLedger`), expansão de itens (client-side), botão "Inativar
  (corrigir)" por linha ativa (chama `deactivateLedgerEntry`). Sinal visual do valor pelo `type`.
- Migração da F005: o botão "Inativar" sai da home do ledger para a linha; banner "último lançamento"
  simplificado (superfície — item 16).
