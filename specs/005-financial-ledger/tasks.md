# Tasks: Financeiro — Captura de Lançamentos

**Input**: Design documents from `specs/005-financial-ledger/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/) (complete-booking, register-walk-in, register-expense, deactivate-ledger-entry, booking-state-machine), [quickstart.md](./quickstart.md)

**Tests**: INCLUÍDOS — a Constituição (Princípio IV, Test-First) é não-negociável para a lógica de
**captura/estado** (concluir, walk-in, despesa, soft delete, branch `already_completed`). Testes de
integração contra **Postgres real** em `tests/integration/ledger/` (mesma infra dos testes da 004);
helper puro coberto por unit test em `tests/unit/ledger/`.

**Organization**: Tarefas agrupadas por user story (P1 → P2 → P3) para entrega incremental. A ordem
respeita as dependências fechadas do plano (migration → branch de estado → cores → UI → smoke).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 / US2 / US3 / US4 / US5 (mapeia o spec)

## ⚠️ Nota de arquitetura (segurança primeiro + arquivos compartilhados)

**Segurança primeiro (Princípio I / FR-018)**: toda escrita financeira passa por `requireOwner` (role
lido do banco por request — F002), **não** pela checagem de ownership da F004 (que autoriza o CLIENTE
via `booking.userId`). O OWNER conclui/registra **qualquer** atendimento. Cada Server Action é fina:
`requireOwner` → core testável. A recusa de não-OWNER (SC-009) é coberta em cada story.

**Branch `already_completed` (F004 — ponto exato, contracts/booking-state-machine.md):** os dois cores
usam padrões **opostos** e recebem o branch em pontos diferentes:

```
reschedule-booking.ts (ALLOWLIST): not_found → not_owner → [already_completed] → not_active(!==ACTIVE) → ...
cancel-booking.ts     (DENYLIST):  not_found → not_owner → already_cancelled → [already_completed] → UPDATE
```

Sem o branch, o `cancel` **cancelaria** um `COMPLETED` (bug latente) e o `reschedule` devolveria o
genérico `not_active`. Reason distinto, nunca reutilizar `not_active`/`already_cancelled`.

**Arquivos compartilhados (sequenciais, não `[P]`):**

- `src/server/ledger/complete-booking.ts`: T009 (US1 base) → T012 (US2 extras).
- `src/server/ledger/ledger-items.ts` (helper puro): T004 (Foundational) usado por T009/T012/T014.
- Cada core tem arquivo próprio (complete/walk-in/expense/deactivate) → cores de stories diferentes são `[P]` entre si.

---

## Phase 1: Setup

**Purpose**: Base de testes de integração da feature (sem tocar código de produção).

- [x] T001 Criar `tests/integration/ledger/` e um `fixtures.ts` reutilizando o padrão de
  `tests/integration/reschedule/fixtures.ts`: seed idempotente de um usuário **OWNER**, um usuário
  **CLIENT**, e helpers para criar um `Booking` `ACTIVE` futuro; reusar `BARBERSHOP_ID`
  (`barbershop-trimote`), os serviços semeados (`service-corte` 40.00/30min, etc.) e
  `localDateTimeToUtc`/`src/domain/time`. Limpeza de `LedgerEntry`/`LedgerEntryItem` entre testes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migration + helper puro compartilhados por todas as stories. **Nenhuma story começa antes.**

**⚠️ CRITICAL**: o valor de enum `COMPLETED`, as tabelas `LedgerEntry`/`LedgerEntryItem` e o helper de
itens são pré-requisito de US1–US5.

- [x] T002 [P] Migration (Prisma normal, **sem SQL manual**): editar `prisma/schema.prisma` —
  adicionar `COMPLETED` a `BookingStatus` (aditivo); enums `LedgerType`/`LedgerOrigin`/`PaymentMethod`;
  models `LedgerEntry` e `LedgerEntryItem` (PKs cuid, `Decimal(10,2)`, `Timestamptz(6)`, relations
  **nomeadas** `LedgerClient`/`LedgerCreatedBy` em User, back-relations em Booking/BarbershopService/
  Barbershop, `bookingId` sem unicidade, `isActive` default true, `@@index([barbershopId, occurredAt])`).
  Rodar `prisma migrate dev --name financial_ledger` + `prisma generate`. **NÃO** tocar a exclusion
  constraint `booking_no_overlap`. (data-model.md; FR-001/010/011/013/017; itens 6/8/9/10/13/14/15)
- [x] T003 [P] Unit test-first do helper puro em `tests/unit/ledger/ledger-items.test.ts`: soma dos
  itens; rejeição de `amount <= 0`; construção do item de serviço a partir de um preço fornecido
  (snapshot); `total == Σ itens`. Deve **falhar** antes de T004. (SC-005; FR-007/FR-011)
- [x] T004 Implementar o helper puro `src/server/ledger/ledger-items.ts` (`LedgerItemInput`,
  resolução de valor do item a partir de um preço fornecido, `sumItems`, validação de positividade),
  sem dependência de Prisma (recebe preços já resolvidos). Torna T003 verde. (FR-007/FR-011/FR-019)

---

## Phase 3: User Story 1 — Concluir atendimento agendado e gerar receita (Priority: P1) 🎯 MVP

**Goal**: OWNER conclui um `Booking` ACTIVE → `COMPLETED` + `LedgerEntry` (INCOME/BOOKING) com item do
serviço agendado (snapshot), tudo atômico. `COMPLETED` é terminal: concluir/remarcar/cancelar de novo
recusam com `already_completed`.

**Independent Test**: Concluir um booking ativo e verificar booking `COMPLETED`, 1 lançamento vinculado
com item = preço no instante da conclusão, e que alterar o preço depois não muda o lançamento.

### Tests (test-first — devem falhar antes da impl)

- [x] T005 [P] [US1] Integração `tests/integration/ledger/complete-booking.test.ts`: sucesso
  (booking `COMPLETED` + 1 `LedgerEntry` INCOME/BOOKING + 1 item snapshot); **atomicidade** — falha na
  criação do lançamento → booking **não** fica `COMPLETED` e nada persiste (SC-001); **snapshot** —
  mudar `BarbershopService.price` depois não altera o lançamento (SC-002); **occurredAt** — passar um
  instante explícito (≠ `endsAt` e ≠ agora) e afirmar que é exatamente esse o valor persistido, não
  derivado do fim do agendamento (FR-017); **paymentMethod** — concluir COM `paymentMethod` e SEM
  (null), afirmando persistência do campo independente de `origin` (ortogonalidade — FR-012/FR-013);
  concluir `COMPLETED` de novo → `already_completed`, **sem** 2º lançamento (SC-003); concluir um
  booking `CANCELLED` → `booking_cancelled` (sem lançamento); serviço com `isActive=false` → conclusão
  **permitida** (snapshot independe de isActive, research.md D5); **não-OWNER** recusado (SC-009).
- [x] T006 [P] [US1] Integração `tests/integration/ledger/completed-state-machine.test.ts`:
  **remarcar** um `COMPLETED` → `already_completed` (allowlist do reschedule), booking intacto (SC-004);
  **cancelar** um `COMPLETED` → `already_completed` e **não** vira `CANCELLED` (regressão do bug latente
  do denylist do cancel, SC-004).

### Implementation

- [x] T007 [US1] Inserir o branch `already_completed` em `src/server/booking/reschedule-booking.ts`
  **antes** do check `status !== "ACTIVE"`; adicionar `"already_completed"` ao union
  `RescheduleBookingReason`; atualizar o comentário de ordem de verificação. (FR-005; contracts/booking-state-machine.md)
- [x] T008 [US1] Inserir o branch `already_completed` em `src/server/booking/cancel-booking.ts`
  **junto** ao check `already_cancelled` e **antes** do `update`; adicionar `"already_completed"` ao
  union `CancelBookingReason`. (FR-005; regressão do denylist)
- [x] T009 [US1] Implementar o core `src/server/ledger/complete-booking.ts` (ordem:
  `booking_not_found` → `already_completed` → `booking_cancelled` → snapshot do serviço agendado via
  `findUnique` **sem** filtrar `isActive` → item base pelo helper → `amount = Σ` →
  `$transaction`(`booking.update(COMPLETED)` + `ledgerEntry.create` com item aninhado)), persistindo
  `occurredAt` (default agora) e `paymentMethod` (opcional) sem inferir de `origin`. Sem extras
  ainda (MVP). (FR-001/002/003/004/012/013/017/019; contracts/complete-booking.md)
- [x] T010 [US1] Implementar a Server Action fina `src/server/actions/complete-booking.ts`
  (`requireOwner` → core; ISO→Date de `occurredAt`). (FR-018)

**Checkpoint US1**: MVP entregue — concluir atendimento gera receita com snapshot, atômico e seguro no
servidor; estado terminal protegido nos 3 caminhos (concluir/remarcar/cancelar).

---

## Phase 4: User Story 2 — Adicionar extras no ato da captura (Priority: P2)

**Goal**: No ato da conclusão (US1) o OWNER adiciona extras (item de serviço com snapshot ou item
manual sem serviço); `amount` do lançamento = soma dos itens, validada na transação. Após concluído,
não há edição de item (só soft delete — clarify).

**Independent Test**: Concluir adicionando um extra de serviço e um manual; verificar `amount == Σ` e
que não há caminho para editar itens depois.

- [x] T011 [P] [US2] Integração `tests/integration/ledger/complete-booking-extras.test.ts`: conclusão
  com extra de serviço (snapshot) + extra manual → `amount == Σ itens` validado na transação (SC-005);
  item com `amount <= 0` → `invalid_amount`; extra com `serviceId` inexistente → `service_not_found`.
  Deve falhar antes de T012. (FR-006/FR-007/FR-011)
- [x] T012 [US2] Estender o core `src/server/ledger/complete-booking.ts` para aceitar `extras[]`
  (serviço via snapshot / manual via valor informado), delegando resolução e soma ao helper
  (`ledger-items.ts`); recomputar `amount` como Σ dentro da mesma `$transaction`. (FR-006/FR-007)

**Checkpoint US2**: conclusão com extras; invariante soma-dos-itens fechada na transação.

---

## Phase 5: User Story 3 — Registrar atendimento avulso / walk-in (Priority: P2)

**Goal**: OWNER registra receita (INCOME/WALK_IN) com itens, sem `bookingId`, sem tocar a agenda;
cliente cadastrado, nome livre ou anônimo.

**Independent Test**: Registrar walk-in nos 3 modos e confirmar lançamento sem vínculo a booking e
agenda/disponibilidade inalteradas.

- [ ] T013 [P] [US3] Integração `tests/integration/ledger/register-walk-in.test.ts`: 3 modos
  (`clientId` cadastrado / só `clientName` / anônimo) → INCOME/WALK_IN, `bookingId` nulo (SC-006);
  **agenda intocada** (sem exclusion constraint, disponibilidade inalterada); **extras** — walk-in com
  item de serviço (snapshot) + extra manual (sem `serviceId`), afirmando `amount == Σ itens` (US2 no
  caminho avulso — FR-006/FR-007); **occurredAt** — instante explícito persistido como informado, não
  derivado (FR-017); **paymentMethod** — registrar COM e SEM `paymentMethod`, persistência independente
  de `origin` (FR-012/FR-013); `items` vazio → `no_items`; item `<= 0` → `invalid_amount`; `clientId`
  inexistente → `client_not_found`; item com `serviceId` inexistente → `service_not_found`; **não-OWNER**
  recusado (SC-009). (FR-006/FR-007/FR-008/FR-009)
- [ ] T014 [US3] Implementar o core `src/server/ledger/register-walk-in.ts` (ordem do contrato;
  itens/extras via helper; `barbershopId` derivado; `$transaction` com itens aninhados), persistindo
  `occurredAt` (default agora) e `paymentMethod` (opcional). (FR-006/FR-008/FR-009/FR-012/FR-013; contracts/register-walk-in.md)
- [ ] T015 [US3] Implementar a Server Action fina `src/server/actions/register-walk-in.ts`
  (`requireOwner` → core). (FR-018)

**Checkpoint US3**: receita fora da agenda capturada nos 3 modos de identificação.

---

## Phase 6: User Story 4 — Registrar despesa (Priority: P2)

**Goal**: OWNER registra despesa (EXPENSE/EXPENSE) com descrição, categoria e valor, sem itens e sem
cliente.

**Independent Test**: Registrar despesa e verificar lançamento sem itens/cliente contando como saída.

- [ ] T016 [P] [US4] Integração `tests/integration/ledger/register-expense.test.ts`: EXPENSE/EXPENSE
  **sem** itens e **sem** cliente (SC-007); **paymentMethod** — registrar COM e SEM `paymentMethod`,
  persistência independente de `origin` (FR-012/FR-013); `amount <= 0` → `invalid_amount`; **não-OWNER**
  recusado (SC-009). (FR-010/FR-011/FR-012/FR-013)
- [ ] T017 [US4] Implementar o core `src/server/ledger/register-expense.ts` (`invalid_amount` →
  `barbershopId` da barbearia do MVP → `ledgerEntry.create` sem `items`), persistindo `paymentMethod`
  (opcional) sem inferir de `origin`. (FR-010/FR-012/FR-013; contracts/register-expense.md)
- [ ] T018 [US4] Implementar a Server Action fina `src/server/actions/register-expense.ts`
  (`requireOwner` → core). (FR-018)

**Checkpoint US4**: saída de dinheiro registrada.

---

## Phase 7: User Story 5 — Corrigir lançamento via soft delete (Priority: P3)

**Goal**: OWNER inativa (`isActive=false`) um lançamento errado; não apaga, não estorna, não desconclui
o booking.

**Independent Test**: Inativar um lançamento e verificar que some do dinheiro válido mas persiste; um
lançamento de BOOKING inativado mantém o booking `COMPLETED`.

- [ ] T019 [P] [US5] Integração `tests/integration/ledger/deactivate-ledger-entry.test.ts`: soft
  delete marca `isActive=false` e **não apaga** (registro consultável) (SC-008); lançamento de origem
  BOOKING inativado **não** desconclui o booking (FR-016); inativar duas vezes → `already_inactive`;
  inexistente → `entry_not_found`; **não-OWNER** recusado (SC-009). (FR-015/FR-016)
- [ ] T020 [US5] Implementar o core `src/server/ledger/deactivate-ledger-entry.ts` (`entry_not_found`
  → `already_inactive` → `update({ isActive: false })`; **não** tocar `Booking.status`). (FR-015/016; contracts/deactivate-ledger-entry.md)
- [ ] T021 [US5] Implementar a Server Action fina `src/server/actions/deactivate-ledger-entry.ts`
  (`requireOwner` → core). (FR-018)

**Checkpoint US5**: correção auditável, sem hard delete nem reabertura de booking.

---

## Phase 8: UI (OWNER)

**Purpose**: Telas/ações mínimas do OWNER para os quatro caminhos + mapa completo de mensagens dos
reasons do ledger e a mensagem do novo reason `already_completed` nos fluxos da F004.

- [ ] T022 [P] UI do OWNER em `src/app/owner/ledger/` (página server + ilhas client mínimas, ShadCN/
  Tailwind, padrão 002): concluir atendimento (com extras), registrar walk-in, registrar despesa e
  inativar lançamento, chamando as Server Actions. **Incluir um mapa `reason → mensagem` (pt-BR)**
  cobrindo TODOS os reasons dos quatro fluxos do ledger, sem reason órfão sem mensagem (mesma
  disciplina que evitou o bug do `no_change`): `booking_not_found`, `already_completed` (na
  conclusão), `booking_cancelled`, `invalid_amount`, `no_items`, `service_not_found`,
  `client_not_found`, `entry_not_found`, `already_inactive`. **Sem** relatório/agregação/caixa/visão
  CLIENT (F006). (US1–US5; FR-018; contracts/*.md)
- [ ] T023 [P] Adicionar a mensagem `already_completed` (pt-BR, ex.: "Este atendimento já foi concluído
  e não pode ser alterado.") ao `FAILURE_MESSAGES` de `src/components/reschedule-flow.tsx` e ao mapa de
  mensagens de `src/components/my-bookings-list.tsx`. (FR-005; contracts/booking-state-machine.md #3)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Atualizar o `README` com o financeiro (fluxos concluir/walk-in/despesa/soft delete;
  reasons incluindo `already_completed`; snapshot/atomicidade; escopo F005 e o que fica na F006) —
  Princípio V.
- [ ] T025 Regressão + validação: `npm test` verde (001–004 intactas — suites de reschedule/cancel/
  disponibilidade/owner **não** enfraquecidas) e executar o smoke manual do [quickstart](./quickstart.md)
  C1–C7. (SC-001..SC-010)

---

## Fora deste tasks.md (registrar como task/issue SEPARADA)

- **Bug do `no_change` (UI da F004)**: a renderização ausente de mensagem para `no_change` em
  `reschedule-flow.tsx` é um defeito **pré-existente da F004**, não da F005. Mesmo aproveitando o toque
  em T023 nos mapas de mensagem, a correção do `no_change` **não** entra nesta feature — abrir
  task/issue própria (escopo F004). Aqui só adicionamos a chave `already_completed`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **BLOQUEIA** todas as stories (migration + helper).
- **User Stories (Phase 3–7)**: dependem da Foundational (precisam do enum `COMPLETED`, das tabelas e
  do helper).
- **UI (Phase 8)**: depende das Server Actions das stories que expõe.
- **Polish (Phase 9)**: depois das stories desejadas.

### User Story Dependencies

- **US1 (P1)**: começa após a Foundational. MVP. Inclui o branch `already_completed` (F004) porque é o
  estado terminal que US1 introduz.
- **US2 (P2)**: estende o core de US1 (`complete-booking.ts`) → **após US1**.
- **US3 (P2)**: core próprio (`register-walk-in.ts`) → independente de US1/US2 (após Foundational).
- **US4 (P2)**: core próprio (`register-expense.ts`) → independente (após Foundational).
- **US5 (P3)**: core próprio (`deactivate-ledger-entry.ts`) → independente (após Foundational).

### Restrição de arquivo compartilhado

- `complete-booking.ts`: T009 (US1) → T012 (US2) **sequenciais**.
- `reschedule-booking.ts` (T007) e `cancel-booking.ts` (T008) são arquivos distintos → `[P]` entre si.
- Cores de US3/US4/US5 (T014/T017/T020) são arquivos distintos → `[P]` entre si e em relação a US1/US2.

### Parallel Opportunities

- Foundational: T002 (migration) e T003 (unit test do helper) `[P]`.
- Testes test-first de cada story `[P]`: T005+T006 (US1); T011 (US2); T013 (US3); T016 (US4); T019 (US5).
- Após a Foundational, as stories independentes US3/US4/US5 podem ser desenvolvidas em paralelo por
  pessoas diferentes (cores em arquivos distintos).
- Polish: T023 e T024 `[P]`.

---

## Parallel Example: User Story 1

```bash
# Testes de US1 juntos (test-first, devem falhar antes da impl):
Task: "complete-booking.test.ts (sucesso/atomicidade/snapshot/already_completed/isActive/authz)"  # T005
Task: "completed-state-machine.test.ts (remarcar+cancelar COMPLETED)"                              # T006
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational: migration + helper) → 3. Phase 3 (US1) → **PARAR e
   VALIDAR** a conclusão ponta a ponta (snapshot + atomicidade + estado terminal protegido) → demo do
   MVP já seguro no servidor.

### Incremental Delivery

Setup + Foundational → **US1** (concluir + receita, MVP) → **US2** (extras) → **US3** (walk-in) →
**US4** (despesa) → **US5** (soft delete) → UI → Polish. Cada incremento agrega valor sem quebrar o
anterior; a regressão (T025) confirma 001–004 intactas.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- **Test-first (Princípio IV)**: os testes de captura/estado (T003, T005, T006, T011, T013, T016, T019)
  devem **falhar** antes da impl correspondente. Integração contra **Postgres real** (a garantia de
  atomicidade/FK/enum vive no banco), no padrão da 004.
- **Segurança primeiro (Princípio I / FR-018)**: `requireOwner` (role) em **todas** as Server Actions;
  recusa de não-OWNER coberta por story (SC-009). Nunca a checagem de `booking.userId` da F004.
- **Escopo local (Princípio VI)**: a F004 recebe **apenas** o branch `already_completed` e os reasons
  (T007/T008/T023); nada além. A exclusion constraint não é tocada (só o enum `COMPLETED`, migração
  Prisma normal — T002).
- **Sem hardcode de valores (FR-019/SC-010)**: preço vem de `BarbershopService.price` no snapshot
  (T004/T009/T012/T014).
- Commits Conventional Commits, corpo ASCII, escopo `(005)`. Commit por task ou grupo lógico; parar em
  qualquer checkpoint para validar a story isoladamente.
