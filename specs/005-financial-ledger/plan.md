# Implementation Plan: Financeiro — Captura de Lançamentos

**Branch**: `005-financial-ledger` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-financial-ledger/spec.md`

## Summary

Permitir que o **OWNER** capture toda entrada/saída de dinheiro da barbearia, formando a base do
balancete (agregações ficam na F006). Introduz duas entidades novas — `LedgerEntry` (razão) e
`LedgerEntryItem` (line items) — e três enums (`LedgerType`, `LedgerOrigin`, `PaymentMethod`), e
adiciona o estado terminal `COMPLETED` ao `BookingStatus` existente. Quatro caminhos de escrita:
concluir agendamento gerando receita com **snapshot** de preço (US1), extras como itens no ato da
captura (US2), walk-in sem agenda (US3) e despesa (US4); mais a correção por **soft delete** (US5).

Reaproveita a fundação: `requireOwner` (F002, autorização por **role** lida do banco por request), o
padrão **core testável + Server Action fina** (F004), `prisma.$transaction` para atomicidade, e o
tempo em UTC/`America/Sao_Paulo`. A não-sobreposição (`booking_no_overlap`, exclusion constraint
parcial `WHERE status='ACTIVE'`) **não muda**: ao virar `COMPLETED` a linha sai do índice
naturalmente; walk-in/despesa não tocam a agenda. A conclusão (US1) faz `booking.update(COMPLETED)` +
`LedgerEntry.create` (com itens aninhados) no **mesmo** `$transaction`; o valor é lido de
`BarbershopService.price` no ato da captura, **independente de `isActive`**. Correção = inativar o
lançamento inteiro (`isActive=false`), nunca hard delete nem estorno.

**Integração F004 (ponto exato — item 17):** as duas checagens de estado usam padrões **opostos**, e
cada uma recebe um branch `already_completed` distinto (reason próprio, ver `research.md` D3):

- `src/server/booking/reschedule-booking.ts` — **allowlist** (`if (status !== "ACTIVE") → not_active`).
  Sem ajuste, um `COMPLETED` cairia no genérico `not_active`. Insere-se `if (status === "COMPLETED")
  return already_completed` **imediatamente antes** do check `!== "ACTIVE"` (novo passo 3, entre
  `not_owner` e `not_active`).
- `src/server/booking/cancel-booking.ts` — **denylist** (`if (status === "CANCELLED") → already_cancelled`,
  senão segue para o UPDATE). Sem ajuste, um `COMPLETED` **seguiria e seria cancelado** (bug). Insere-se
  `if (status === "COMPLETED") return already_completed` **ao lado** do check `already_cancelled`, antes
  do `update`.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20+ (Next.js 16, App Router) — mesma da 001–004.

**Primary Dependencies**: Next.js 16, React 19, Prisma 6, NextAuth (Google), ShadCN UI + Tailwind,
Luxon, Vitest. **Nenhuma dependência nova.**

**Storage**: PostgreSQL (Docker `:5433`). **Migration Prisma normal** (`prisma migrate dev`): novos
enums, `COMPLETED` aditivo em `BookingStatus`, tabelas `LedgerEntry`/`LedgerEntryItem`, índice
`@@index([barbershopId, occurredAt])`. **Nenhuma migration SQL manual** — a exclusion constraint não
é tocada (item 15).

**Testing**: Vitest. Test-first (Princípio IV) foca conclusão atômica + snapshot (US1), invariante
soma-dos-itens na transação (FR-007), recusa `already_completed` nas três ações (concluir/remarcar/
cancelar), walk-in nos três modos de identificação (FR-009), e soft delete sem reabrir booking
(FR-016). Integração contra Postgres (transação, FKs, enums).

**Target Platform**: Aplicação web full-stack Next.js — mesma da 001–004.

**Project Type**: Web app full-stack Next.js (projeto único).

**Performance Goals**: Baixo volume (uma barbearia). Sem metas de throughput; captura é operação de UX.

**Constraints**: Autorização por **role OWNER** no servidor (`requireOwner`), **não** por
`booking.userId` (item 18 — no Booking `userId` é o CLIENTE). Atomicidade conclusão+lançamento em
`$transaction` (FR-003). Dinheiro sempre `Decimal(10,2)`, valor positivo, sinal vem do `type`
(FR-011). Snapshot de preço independe de `isActive` (item 7). Sem hardcode de valores (FR-019).
`occurredAt` informado na captura, não derivado de `endsAt` (FR-017). Sem constraint de banco
"receita exige booking concluído" (FR-014).

**Scale/Scope**: 1 barbearia (`barbershopId` derivado no servidor no MVP), poucos lançamentos/dia.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aderência | Status |
|-----------|-----------|--------|
| I. Segurança (Blue Team) | Toda escrita financeira passa por `requireOwner` (role lido do banco por request) **no servidor**; um não-OWNER é recusado. Entrada validada no servidor (valores positivos, soma dos itens, existência de FK). Sem novos segredos. | ✅ PASS |
| II. Integridade no Banco | Conclusão+lançamento+itens no **mesmo `$transaction`**; itens aninhados garantem que não existe lançamento sem itens nem parcial. FKs (`Cascade` onde o pai manda). A não-sobreposição continua na exclusion constraint intacta; walk-in não reserva slot. A regra "receita exige concluído" fica **na aplicação** por decisão explícita (FR-014) — não é invariante de dados. | ✅ PASS |
| III. SOLID / Clean Code | Cores testáveis por caso de uso (`complete-booking`, `register-walk-in`, `register-expense`, `deactivate-ledger-entry`) sob Server Actions finas; snapshot e soma-dos-itens isolados em helper puro; reason `already_completed` inserido no ponto mínimo de cada core F004. | ✅ PASS |
| IV. Test-First | Testes falhando antes: conclusão atômica + snapshot, invariante da soma na transação, `already_completed` (3 ações), walk-in (3 modos), soft delete sem reabrir booking. | ✅ PASS |
| V. Convenções | Conventional Commits; identificadores em inglês (LedgerEntry/LedgerEntryItem/enums), comentários/docs em português; README atualizado com o financeiro. | ✅ PASS |
| VI. Escopo Disciplinado | Toque na F004 limitado ao **branch de estado** `already_completed` (2 cores + 2 mapas de mensagem + unions de reason); nada de reescrever proteções existentes. Sem relatório/agregação/gateway (F006/futuro). | ✅ PASS |
| VII. Tempo (UTC/SP) | `occurredAt` e timestamps em `Timestamptz(6)` (UTC); leitura/entrada em `America/Sao_Paulo` reusa a camada existente. `occurredAt` é instante da captura, não derivado de `endsAt`. | ✅ PASS |

**Resultado do gate**: PASS — sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/005-financial-ledger/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── complete-booking.md          # US1 + integração já_concluído
│   ├── register-walk-in.md          # US3 (+ extras US2)
│   ├── register-expense.md          # US4
│   ├── deactivate-ledger-entry.md   # US5 (soft delete)
│   └── booking-state-machine.md     # ponto de inserção already_completed (F004)
└── tasks.md                         # (/speckit-tasks — não criado aqui)
```

### Source Code (repository root) — adições/ajustes

```text
prisma/
├── schema.prisma                    # AJUSTE: +COMPLETED em BookingStatus; +3 enums; +LedgerEntry/LedgerEntryItem;
│                                    #         relations nomeadas em User/Booking/BarbershopService
└── migrations/<ts>_financial_ledger/migration.sql   # NOVO: migration Prisma normal (sem SQL manual)

src/
├── server/
│   ├── ledger/                              # NOVO domínio de captura (cores testáveis)
│   │   ├── complete-booking.ts              # US1: conclui + LedgerEntry(INCOME/BOOKING) + itens, atômico
│   │   ├── register-walk-in.ts              # US3: LedgerEntry(INCOME/WALK_IN) + itens, sem booking
│   │   ├── register-expense.ts              # US4: LedgerEntry(EXPENSE/EXPENSE), sem itens/cliente
│   │   ├── deactivate-ledger-entry.ts       # US5: soft delete (isActive=false), não reabre booking
│   │   └── ledger-items.ts                  # helper puro: snapshot de preço + soma/validação dos itens
│   ├── booking/
│   │   ├── reschedule-booking.ts            # AJUSTE F004: branch already_completed antes de not_active
│   │   └── cancel-booking.ts                # AJUSTE F004: branch already_completed antes do update
│   └── actions/
│       ├── complete-booking.ts              # NOVO Server Action fina (requireOwner → core)
│       ├── register-walk-in.ts              # NOVO
│       ├── register-expense.ts              # NOVO
│       └── deactivate-ledger-entry.ts       # NOVO
├── components/
│   ├── reschedule-flow.tsx                  # AJUSTE: +already_completed no FAILURE_MESSAGES
│   └── my-bookings-list.tsx                 # AJUSTE: +already_completed no mapa de mensagens
└── app/
    └── owner/
        └── ledger/…                         # UI mínima do OWNER para capturar (concluir/walk-in/despesa/inativar)

tests/
├── unit/
│   └── ledger/                              # helper puro: soma-dos-itens, snapshot, valor positivo
└── integration/
    └── ledger/                              # conclusão atômica+snapshot, already_completed (3 ações),
                                             # walk-in (3 modos), expense, soft delete sem reabrir
```

**Structure Decision**: Mantém a arquitetura 001–004 — **cores testáveis** em
`src/server/ledger/` (um por caso de uso) sob **Server Actions finas** em `src/server/actions/` que
derivam o OWNER via `requireOwner`. O snapshot de preço e a validação soma-dos-itens vivem num helper
puro (`ledger-items.ts`) para teste isolado. O toque na F004 é cirúrgico: apenas o branch
`already_completed` nos dois cores de estado e nos dois mapas de mensagem, sem reescrever proteções.

## Complexity Tracking

> Nenhuma violação a justificar. A atomicidade via `$transaction` (conclusão + lançamento + itens) é
> complexidade **essencial** ao Princípio II e ao FR-003, não acidental. Os dois FKs de `LedgerEntry`
> para `User` (relations nomeadas `LedgerClient`/`LedgerCreatedBy`) são exigência do modelo (cliente ≠
> autor) e decisão fechada. A regra "receita exige concluído" fica **fora** do banco por decisão
> explícita (FR-014), evitando uma constraint que barraria online pré-pago futuro.
