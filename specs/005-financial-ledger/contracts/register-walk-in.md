# Contrato — Registrar Atendimento Avulso / Walk-in (US3, + extras US2)

Server Action fina `registerWalkIn` → core `registerWalkInForOwner`. Autorização **`requireOwner`**.
Lançamento de **receita** (INCOME/WALK_IN) **sem** `bookingId`. **Não** passa pela exclusion
constraint (não reserva slot). Itens (serviço e/ou manuais) capturados no ato.

## Server Action

```ts
// src/server/actions/register-walk-in.ts  ("use server")
registerWalkIn(input: {
  items: Array<{                // >= 1 item (receita exige item)
    serviceId?: string;         // item de serviço (snapshot) OU manual
    description: string;
    amount?: number;            // obrigatório p/ manual; ignorado p/ item de serviço (usa snapshot)
  }>;
  occurredAt?: string;          // ISO 8601 UTC; default = agora (FR-017)
  paymentMethod?: PaymentMethod;// opcional
  clientId?: string;            // cliente cadastrado (FR-009) OU
  clientName?: string;          // nome livre OU
                                // nenhum dos dois → anônimo
}): Promise<RegisterWalkInResult>
```

## Core

```ts
// src/server/ledger/register-walk-in.ts
registerWalkInForOwner(input: {
  items: LedgerItemInput[];
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
  clientId?: string;
  clientName?: string;
  ownerId: string;              // createdBy (da sessão)
}): Promise<RegisterWalkInResult>
```

## Reasons

```ts
type RegisterWalkInReason =
  | "no_items"          // items vazio — receita exige >= 1 item
  | "invalid_amount"    // algum item com amount <= 0 (FR-011)
  | "service_not_found" // item referenciou serviceId inexistente
  | "client_not_found"; // clientId informado mas não existe

type RegisterWalkInResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: RegisterWalkInReason };
```

## Ordem de verificação

1. `items.length === 0` → `no_items`.
2. Para item de serviço: `findUnique(serviceId)` sem filtrar `isActive` (snapshot D5); `!service` →
   `service_not_found`; `amount = price`. Item manual: usa `amount` informado.
3. Qualquer `amount <= 0` → `invalid_amount`.
4. `clientId` informado e inexistente → `client_not_found`. (Anônimo: sem `clientId` e/ou só
   `clientName`; ambos ausentes = totalmente anônimo — permitido.)
5. `amount = Σ item.amount`; `barbershopId` derivado (do serviço, ou barbearia única do MVP — D8).
6. **`$transaction`**: `ledgerEntry.create({ type: INCOME, origin: WALK_IN, bookingId: null, clientId,
   clientName, createdBy: ownerId, amount, occurredAt, paymentMethod, items: { create: [...] } })`.

## Invariantes

- **Não toca a agenda**: sem `Booking`, sem exclusion constraint, sem disponibilidade (SC-006).
- Três modos de identificação suportados (cadastrado / nome livre / anônimo) — FR-009.
- `amount == Σ itens` validado na transação (FR-007).
