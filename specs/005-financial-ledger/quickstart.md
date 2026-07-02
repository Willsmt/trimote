# Quickstart — Financeiro: Captura de Lançamentos (005)

Guia de validação da feature. Detalhes de modelo/contratos em [data-model.md](./data-model.md) e
[contracts/](./contracts/). Não contém implementação — só como preparar, rodar e o que esperar.

## Pré-requisitos

- Postgres em `:5433` (Docker) e `.env` com `DATABASE_URL` (padrão 001).
- Um usuário **OWNER** (role no banco) — ver `prisma/seed.ts` / promoção de role da F002.
- Uma `Barbershop`, `OpeningHours` e ≥ 1 `BarbershopService` ativo (seed existente).

## Setup

```bash
npm install
npx prisma migrate dev        # aplica a migration financial_ledger (enums, COMPLETED, tabelas)
npx prisma generate
npm run db:seed               # se necessário (barbearia/owner/serviços)
```

## Rodar os testes (test-first — Princípio IV)

```bash
npm test                      # tudo (unit + integração), inclui regressão 001–004
npm run test:unit             # helper puro de itens (soma, snapshot, valor positivo)
npm run test:integration      # transação, already_completed, walk-in, expense, soft delete
```

**Esperado**: verde. As suítes 001–004 continuam passando (a única mudança na F004 é o branch
`already_completed`; nenhuma proteção existente é reescrita).

## Cenários de validação (mapeiam para US/SC/FR)

### C1 — Concluir agendamento gera receita com snapshot (US1 / SC-001, SC-002)

1. Como OWNER, conclua um `Booking` ACTIVE.
2. **Esperado**: booking vira `COMPLETED`; existe **1** `LedgerEntry` `INCOME`/`BOOKING` vinculado, com
   **1** item do serviço agendado; `item.amount == price` do serviço **no momento da conclusão**.
3. Altere `BarbershopService.price` depois → o lançamento **não** muda (fidelidade histórica).
4. Force falha na criação do item → o booking **não** fica `COMPLETED` (atomicidade, SC-001).

### C2 — Extras no ato da conclusão/walk-in (US2 / SC-005)

1. Conclua um atendimento adicionando um extra de serviço e um extra manual (sem `serviceId`).
2. **Esperado**: `LedgerEntry.amount == Σ itens`; validado dentro da transação.
3. Tentar editar itens **após** o booking concluído → não há caminho: a única mutação do lançamento é o
   soft delete (US5). (clarify Session 2026-07-01)

### C3 — Recusa `already_completed` nas três ações (FR-004/FR-005 / SC-003, SC-004)

1. **Concluir** de novo um booking `COMPLETED` → recusa `already_completed`, **sem** 2º lançamento.
2. **Remarcar** (F004) um `COMPLETED` → recusa `already_completed`, booking intacto.
3. **Cancelar** (F004) um `COMPLETED` → recusa `already_completed`, **não** vira `CANCELLED`
   (regressão do padrão denylist do cancel — ver contracts/booking-state-machine.md).
4. **Esperado (UI)**: mensagem em português renderiza (chave `already_completed` nos mapas), sem
   mensagem ausente.

### C4 — Walk-in nos três modos, sem tocar a agenda (US3 / SC-006)

1. Registre walk-in (a) com `clientId` cadastrado, (b) só `clientName` livre, (c) anônimo (nenhum).
2. **Esperado**: 3 lançamentos `INCOME`/`WALK_IN`, `bookingId` nulo; disponibilidade/agenda inalteradas.
3. Walk-in com `items` vazio → recusa `no_items`; item `amount <= 0` → `invalid_amount`.

### C5 — Despesa (US4 / SC-007)

1. Registre uma despesa (descrição, categoria, valor).
2. **Esperado**: `LedgerEntry` `EXPENSE`/`EXPENSE`, **sem** itens e **sem** cliente; valor positivo,
   contando como saída pelo `type`.
3. `amount <= 0` → recusa `invalid_amount`.

### C6 — Soft delete corrige sem apagar nem reabrir (US5 / SC-008)

1. Inative um lançamento errado (`isActive=false`).
2. **Esperado**: registro permanece no banco (auditoria); deixa de contar como dinheiro válido.
3. Inative um lançamento de origem BOOKING → o `Booking` permanece `COMPLETED` (FR-016).
4. Inativar duas vezes → `already_inactive`.

### C7 — Autorização por role (FR-018 / SC-009)

1. Um usuário **não-OWNER** (CLIENT) tenta qualquer escrita financeira.
2. **Esperado**: recusado no servidor (`requireOwner`), independente de ser dono do booking.

## Notas

- `barbershopId` é derivado no servidor (MVP barbearia única — data-model D8).
- `occurredAt` é o instante da captura (default agora), **não** o `endsAt` do booking (FR-017).
- Sem relatório/agregação/caixa/gráfico e sem gateway/webhooks (F006 / feature futura).
