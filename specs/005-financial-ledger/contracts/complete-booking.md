# Contrato — Concluir Atendimento Agendado (US1)

Server Action fina `completeBooking` → core `completeBookingForOwner`. Autorização **`requireOwner`**
(role, não ownership do booking — research.md D4). Conclusão + lançamento no **mesmo `$transaction`**
(FR-003).

## Server Action

```ts
// src/server/actions/complete-booking.ts  ("use server")
completeBooking(input: {
  bookingId: string;
  occurredAt?: string;          // ISO 8601 UTC; default = agora (instante da captura, FR-017)
  paymentMethod?: PaymentMethod;// opcional (D12)
  extras?: Array<{              // US2 — extras capturados SÓ no ato da conclusão
    serviceId?: string;         // extra de serviço (snapshot) OU
    description: string;        // extra manual (sem serviceId)
    amount?: number;            // obrigatório p/ extra manual; ignorado p/ extra de serviço (usa snapshot)
  }>;
}): Promise<CompleteBookingResult>
```

## Core

```ts
// src/server/ledger/complete-booking.ts
completeBookingForOwner(input: {
  bookingId: string;
  occurredAt?: Date;            // default new Date()
  paymentMethod?: PaymentMethod;
  extras?: LedgerItemInput[];
}): Promise<CompleteBookingResult>
```

## Reasons

```ts
type CompleteBookingReason =
  | "booking_not_found"
  | "already_completed"   // booking.status === COMPLETED (FR-004) — reason distinto (D3)
  | "booking_cancelled"   // booking.status === CANCELLED (não se conclui cancelado)
  | "invalid_amount"      // algum item (base ou extra) com amount <= 0 (FR-011)
  | "service_not_found";  // extra referenciou serviceId inexistente

type CompleteBookingResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: CompleteBookingReason };
```

## Ordem de verificação (curto-circuito; sem efeito colateral até o commit)

1. Carrega `Booking` (id, status, barbershopId, serviceId, userId). `!booking` → `booking_not_found`.
2. `status === "COMPLETED"` → `already_completed`.
3. `status === "CANCELLED"` → `booking_cancelled`.
4. Snapshot do serviço agendado: `findUnique(serviceId)` **sem** filtrar `isActive` (D5); lê `price`.
5. Resolve itens: item base (serviço agendado, `amount = price` snapshot) + `extras`. Extra de serviço
   lê `price` do serviço (snapshot); extra manual usa `amount` informado. Qualquer `amount <= 0` →
   `invalid_amount`. Extra com `serviceId` inexistente → `service_not_found`.
6. `amount = Σ item.amount` (D7).
7. **`$transaction`**: `booking.update({ status: COMPLETED })` **+** `ledgerEntry.create({ data: {
   type: INCOME, origin: BOOKING, barbershopId, bookingId, clientId: booking.userId, createdBy: owner,
   amount, occurredAt, paymentMethod, items: { create: [...] } } })`. Ambos ou nenhum (FR-003).

## Snapshot & fidelidade (FR-002)

- O `amount` do item de serviço = `BarbershopService.price` **no instante da conclusão**; congela.
  Alterar o preço depois **não** muda o lançamento.
- `clientId` do lançamento = `booking.userId` (o cliente que agendou). `createdBy` = OWNER da sessão.

## Invariantes verificadas

- Não gera lançamento duplicado: `already_completed` barra a 2ª conclusão (FR-004, SC-003).
- `amount == Σ itens` por construção; validação na transação (FR-007, SC-005).
- Falha em qualquer passo ⇒ nada persistido (SC-001): nem booking concluído, nem lançamento.
