# Contrato — Registrar Despesa (US4)

Server Action fina `registerExpense` → core `registerExpenseForOwner`. Autorização **`requireOwner`**.
Lançamento de **despesa** (EXPENSE/EXPENSE) **sem itens** e **sem cliente**.

## Server Action

```ts
// src/server/actions/register-expense.ts  ("use server")
registerExpense(input: {
  amount: number;               // > 0 (sinal vem do type EXPENSE, FR-011)
  description: string;
  category?: string;            // texto livre (sem lista fechada nesta feature)
  occurredAt?: string;          // ISO 8601 UTC; default = agora (FR-017)
  paymentMethod?: PaymentMethod;// opcional
}): Promise<RegisterExpenseResult>
```

## Core

```ts
// src/server/ledger/register-expense.ts
registerExpenseForOwner(input: {
  amount: number;
  description: string;
  category?: string;
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
  ownerId: string;              // createdBy
}): Promise<RegisterExpenseResult>
```

## Reasons

```ts
type RegisterExpenseReason = "invalid_amount";  // amount <= 0 (FR-011)

type RegisterExpenseResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: RegisterExpenseReason };
```

## Ordem de verificação

1. `amount <= 0` → `invalid_amount`.
2. `barbershopId` = barbearia única do MVP (D8).
3. `ledgerEntry.create({ type: EXPENSE, origin: EXPENSE, amount, description, category, occurredAt,
   paymentMethod, createdBy: ownerId, bookingId: null, clientId: null, clientName: null })` — **sem**
   `items`.

## Invariantes

- **Sem itens, sem cliente** (US4): não há relação com serviço nem com `User` cliente.
- Valor positivo; representa saída de dinheiro pelo `type=EXPENSE` (FR-011, SC-007).
- Escrita simples (não precisa de `$transaction` multi-statement, mas segue o padrão de escrita única).
