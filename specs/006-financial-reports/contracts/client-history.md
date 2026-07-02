# Contract: Client Spending History (US5)

Histórico dos próprios gastos do usuário autenticado (qualquer papel). Receitas ativas em que ele é o
cliente, paginadas por keyset. `clientId` vem **sempre da sessão**, nunca do input.

## Core — `src/server/ledger/client-history.ts`

```ts
export interface ClientHistoryInput {
  userId: string;             // = session.user.id (imposto pela action, nunca do input)
  cursor?: { occurredAt: Date; id: string };
  pageSize?: number;          // default 10
}

export interface ClientHistoryRow {
  id: string; occurredAt: Date; description: string; amount: Prisma.Decimal;
  items: { description: string; amount: Prisma.Decimal }[];
}

export interface ClientHistoryResult {
  rows: ClientHistoryRow[];
  nextCursor: { occurredAt: Date; id: string } | null;
}

export async function listClientHistory(input: ClientHistoryInput): Promise<ClientHistoryResult>;
```

### Comportamento

- `where { clientId: input.userId, type: 'INCOME', isActive: true }` (D11).
- Mesmo keyset da listagem: `orderBy [{ occurredAt: 'desc' }, { id: 'desc' }]`, `take pageSize + 1`,
  cursor composto `(occurredAt, id)`.
- `select` enxuto (sem `type`/`origin`/`paymentMethod` na saída) + `include items` (FR-020).

### Invariantes (testáveis)

- Não retorna: despesas (`type=EXPENSE`), lançamentos de outro cliente, anônimos (`clientId=null`),
  inativos (SC-010).
- `clientId` **nunca** vem do input — passar um id no input é ignorado; filtro = sessão (SC-011).

## Server Action — `src/server/actions/list-my-ledger.ts`

```ts
export async function listMyLedger(input: {
  cursor?: { occurredAtIso: string; id: string };
}): Promise<ClientHistoryPageDTO>;   // rows (Decimal→string, datas→ISO) + nextCursor serializado
```

- `const user = await requireUser()` — **não** `requireOwner` (FR-019); `userId = user.id`.
- **Não aceita `clientId` no input** (o parâmetro sequer existe na assinatura — FR-021). Só um cursor
  opcional, validado no servidor.
- Delega ao core com `userId` da sessão; serializa para `ClientHistoryPageDTO` (D5).

## Camada de apresentação (US5)

- **Server Component** `src/app/my-spending/page.tsx`: `requireUser` (redirect ao login se
  visitante); resolve o fuso da barbearia (single-shop MVP) para formatar `occurredAt`; render da 1ª
  página + **ilha client** `my-spending-list.tsx` para "carregar mais" (chama `listMyLedger`).
- Exibe momento, descrição/itens e valor (FR-020). Sem sinal de despesa (só receitas do cliente).
