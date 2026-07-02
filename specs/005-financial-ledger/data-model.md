# Data Model — Financeiro: Captura de Lançamentos (005)

Decisões fechadas (input do `/speckit-plan`). Identificadores em inglês (Princípio V); comentários em
português. Dinheiro `Decimal(10,2)`; instantes `Timestamptz(6)` em UTC (Princípio VII). PKs cuid.

## Enums (novos)

```prisma
enum LedgerType {
  INCOME
  EXPENSE
}

enum LedgerOrigin {
  BOOKING
  WALK_IN
  EXPENSE
}

enum PaymentMethod {
  CASH
  PIX
  CARD
  ONLINE
  OTHER
}
```

## Enum alterado — `BookingStatus`

```prisma
enum BookingStatus {
  ACTIVE
  CANCELLED
  COMPLETED   // NOVO (aditivo). Terminal. Sai do índice parcial booking_no_overlap naturalmente.
}
```

- **Aditivo**: `ALTER TYPE "BookingStatus" ADD VALUE 'COMPLETED'` (migration Prisma normal). A exclusion
  constraint `booking_no_overlap` (parcial `WHERE status='ACTIVE'`) **não muda** (research.md D11).

## Entidade — `LedgerEntry`

Uma linha do razão financeiro (entrada ou saída). Valor sempre positivo; o sinal vem de `type`.

| Campo | Tipo | Regras / Notas |
|-------|------|----------------|
| `id` | `String @id @default(cuid())` | PK cuid (D1). |
| `barbershopId` | `String` | **NOT NULL**, FK `Barbershop` `onDelete: Cascade` (D8). Derivado no servidor. |
| `type` | `LedgerType` | INCOME/EXPENSE. Define o sinal (FR-011). |
| `origin` | `LedgerOrigin` | BOOKING/WALK_IN/EXPENSE. Ortogonal a `paymentMethod` (FR-012). |
| `amount` | `Decimal @db.Decimal(10,2)` | **> 0**. Receita: soma dos itens (computada, D7). Despesa: informado. |
| `occurredAt` | `DateTime @db.Timestamptz(6)` | Instante da captura (FR-017). **Não** derivado de `endsAt`. UTC. |
| `description` | `String` | Texto livre. |
| `category` | `String?` | Nullable; usado em despesa (texto livre, sem lista fechada). |
| `paymentMethod` | `PaymentMethod?` | Opcional; informativo (D12). |
| `externalRef` | `String?` | Preparo online, sem uso agora (FR-013/D12). |
| `bookingId` | `String?` | FK `Booking`. Preenchido só quando `origin=BOOKING`. **Sem unicidade** (D10). |
| `clientId` | `String?` | FK `User`, relation **`LedgerClient`** (D9). Nullable (walk-in anônimo). |
| `clientName` | `String?` | Nome livre do walk-in anônimo (FR-009). |
| `createdBy` | `String` | **NOT NULL**, FK `User`, relation **`LedgerCreatedBy`** (OWNER autor, auditoria). |
| `isActive` | `Boolean @default(true)` | Soft delete = única correção (FR-015). Inativo ≠ dinheiro válido. |
| `createdAt` | `DateTime @default(now()) @db.Timestamptz(6)` | |
| `updatedAt` | `DateTime @updatedAt @db.Timestamptz(6)` | |

Relations e índice:

```prisma
model LedgerEntry {
  // …campos acima…
  barbershop Barbershop         @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  booking    Booking?           @relation(fields: [bookingId], references: [id])
  client     User?              @relation("LedgerClient",    fields: [clientId],  references: [id])
  creator    User               @relation("LedgerCreatedBy", fields: [createdBy], references: [id])
  items      LedgerEntryItem[]

  @@index([barbershopId, occurredAt])   // ajuda a F006 (D8/item 13)
}
```

**Invariantes (aplicação, não banco):**

- `amount > 0` e cada `item.amount > 0` (FR-011).
- Receita (BOOKING/WALK_IN): `amount == Σ item.amount`, validado **dentro da transação** (FR-007); ≥ 1 item.
- Despesa (EXPENSE): **sem** itens, **sem** `clientId`/`clientName`; `amount` informado direto (US4).
- `origin=BOOKING` ⇒ `bookingId` preenchido; walk-in/despesa ⇒ `bookingId` nulo.
- **NÃO** existe constraint de banco "INCOME exige booking COMPLETED" — disciplina fica na aplicação
  (FR-014), para permitir online pré-pago futuro.

## Entidade — `LedgerEntryItem`

Line item de um lançamento de receita (serviço agendado ou extra).

| Campo | Tipo | Regras / Notas |
|-------|------|----------------|
| `id` | `String @id @default(cuid())` | PK cuid. |
| `ledgerEntryId` | `String` | FK `LedgerEntry` `onDelete: Cascade`. |
| `serviceId` | `String?` | FK `BarbershopService`. **Nullable**: extra manual sem serviço (US2). |
| `description` | `String` | Texto livre. |
| `amount` | `Decimal @db.Decimal(10,2)` | **> 0**. Item de serviço = snapshot de `BarbershopService.price`. |

```prisma
model LedgerEntryItem {
  id            String            @id @default(cuid())
  ledgerEntryId String
  serviceId     String?
  description   String
  amount        Decimal           @db.Decimal(10, 2)

  ledgerEntry LedgerEntry        @relation(fields: [ledgerEntryId], references: [id], onDelete: Cascade)
  service     BarbershopService? @relation(fields: [serviceId], references: [id])
}
```

**Snapshot (D5):** item de serviço lê `BarbershopService.price` no ato da captura, **independente de
`isActive`**; o valor congela no item e não muda se o preço mudar depois (FR-002).

## Back-relations (models existentes)

```prisma
model Booking {
  // …existente…
  ledgerEntries LedgerEntry[]     // NOVO back-relation (bookingId nullable, N por soft delete)
}

model BarbershopService {
  // …existente…
  ledgerItems LedgerEntryItem[]   // NOVO back-relation (itens de serviço)
}

model User {
  // …existente…
  ledgerEntriesAsClient  LedgerEntry[] @relation("LedgerClient")     // NOVO
  ledgerEntriesCreated   LedgerEntry[] @relation("LedgerCreatedBy")  // NOVO
}

model Barbershop {
  // …existente…
  ledgerEntries LedgerEntry[]     // NOVO
}
```

## Estados & transições (Booking) — impacto F005

```text
ACTIVE ──cancel──▶ CANCELLED        (F004, existente)
ACTIVE ──complete──▶ COMPLETED      (F005, US1 — terminal; dispara LedgerEntry)
COMPLETED ──complete/reschedule/cancel──▶ RECUSADO (reason `already_completed`)
```

- `COMPLETED` é **terminal**: concluir de novo é recusado (FR-004); remarcar/cancelar são recusados
  (FR-005) — ambos com reason `already_completed` (research.md D3, ponto de inserção por core).
- Inativar um `LedgerEntry` de origem BOOKING **não** altera `Booking.status` (FR-016): permanece
  `COMPLETED`.

## Migration (Prisma normal — sem SQL manual)

`prisma/migrations/<ts>_financial_ledger/migration.sql` gerado por `prisma migrate dev`:

1. `CREATE TYPE "LedgerType"`, `"LedgerOrigin"`, `"PaymentMethod"`.
2. `ALTER TYPE "BookingStatus" ADD VALUE 'COMPLETED'`.
3. `CREATE TABLE "LedgerEntry"` (+ FKs, default `isActive=true`, índice `barbershopId, occurredAt`).
4. `CREATE TABLE "LedgerEntryItem"` (+ FKs, `onDelete: Cascade` do pai).

A exclusion constraint `booking_no_overlap` **não** é tocada (permanece na migration SQL manual da 001).
