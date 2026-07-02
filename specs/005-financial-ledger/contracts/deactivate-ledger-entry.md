# Contrato — Corrigir Lançamento via Soft Delete (US5)

Server Action fina `deactivateLedgerEntry` → core `deactivateLedgerEntryForOwner`. Autorização
**`requireOwner`**. Correção = `isActive=false` (FR-015). **Nunca** hard delete nem estorno. **Não**
reabre booking (FR-016).

## Server Action

```ts
// src/server/actions/deactivate-ledger-entry.ts  ("use server")
deactivateLedgerEntry(input: {
  ledgerEntryId: string;
}): Promise<DeactivateLedgerEntryResult>
```

## Core

```ts
// src/server/ledger/deactivate-ledger-entry.ts
deactivateLedgerEntryForOwner(input: {
  ledgerEntryId: string;
}): Promise<DeactivateLedgerEntryResult>
```

## Reasons

```ts
type DeactivateLedgerEntryReason =
  | "entry_not_found"
  | "already_inactive";  // isActive já false (idempotência amigável)

type DeactivateLedgerEntryResult =
  | { ok: true }
  | { ok: false; reason: DeactivateLedgerEntryReason };
```

## Ordem de verificação

1. Carrega `LedgerEntry` (id, isActive, bookingId). `!entry` → `entry_not_found`.
2. `isActive === false` → `already_inactive`.
3. `ledgerEntry.update({ where: { id }, data: { isActive: false } })`. **Só** o lançamento; nenhuma
   escrita toca `Booking.status`.

## Invariantes

- **Sem hard delete**: o registro permanece consultável para auditoria (FR-015, SC-008).
- **Não reabre booking**: inativar um lançamento de origem BOOKING mantém o `Booking` `COMPLETED`
  (FR-016, SC-008).
- Não há edição de item individual: corrigir um lançamento errado = inativar o **lançamento inteiro** e,
  se necessário, registrar um novo (clarify Session 2026-07-01). Nenhuma mutação de item é exposta.
- Não impõe unicidade de `bookingId`: um booking pode ficar com 1 lançamento ativo + N inativados (D10).
