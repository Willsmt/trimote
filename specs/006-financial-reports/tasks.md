---

description: "Task list for 006-financial-reports"
---

# Tasks: Financeiro — Balancete e Histórico

**Input**: Design documents from `specs/006-financial-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (cash-summary, ledger-list,
client-history)

**Tests**: INCLUÍDOS e **test-first** para os cores de leitura (bucketização por fuso e keyset são a
lógica de domínio crítica — Princípio IV). Integração contra Postgres real.

**Organization**: por user story (US1..US5), em ordem de prioridade. US1+US2 compartilham um único
core (`cash-summary.ts`) e são entregues juntas.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1..US5; fases Setup/Foundational/Polish não têm label

## Regras invioláveis (do briefing)

- **NENHUMA** task altera arquivos de **core/action da F005** — `deactivate-ledger-entry.ts` (core e
  action), `complete-booking.ts`, `register-walk-in.ts`, `register-expense.ts`, `ledger-items.ts`
  ficam **intocados** (FR-025/D13). Exceção única: **superfície de UI** da home do ledger (T026).
- **Nenhuma migração/entidade nova** (leitura pura — FR-025). **Sem** gráficos/export (FR-026).
- Dinheiro em `Prisma.Decimal`, serializado para **string** na fronteira Server→Client (D5).
- Fuso via `Barbershop.timezone` **parametrizado** (nunca hardcode/interpolação em SQL) (D15).
- Commits Conventional Commits, escopo `(006)`, corpo ASCII; cada task referencia FR/US/SC.

---

## Phase 1: Setup

**Purpose**: preparar o terreno de leitura pura (nenhuma dependência nova, nenhum schema).

- [X] T001 Confirmar que a feature é leitura pura: `prisma/schema.prisma` **inalterado** (nenhuma
  migração/entidade — FR-025) e criar o diretório `tests/integration/reports/` para os testes de
  leitura (seguindo o padrão de `tests/integration/ledger/`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura compartilhada por todas as histórias. **BLOQUEIA** as fases de história.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [X] T003 Teste unitário `tests/unit/time/period-bounds.test.ts` para `periodBoundsInZone`
  (**test-first — escrever e ver FALHAR antes de T002**): semana ISO (segunda), bordas de mês/ano, e
  um instante 22:30 local perto da virada UTC caindo no dia local correto. (FR-003, SC-003)
- [X] T002 Adicionar helpers de limites de período em `src/domain/time/index.ts` (**após T003 RED**):
  `periodBoundsInZone(referenceLocalDate, granularity, timeZone) -> { startUtc, endUtc }` (dia /
  **semana ISO começando na segunda** / mês / ano, no fuso da barbearia, retornando range UTC
  `[início, fim)`) e `shiftPeriod(referenceLocalDate, granularity, dir)` para navegação
  anterior/próximo. Fim calculado somando o intervalo em wall-clock local antes de voltar a UTC
  (DST-safe via Luxon). Mantém a fronteira única de fuso do projeto. (FR-002/FR-003, D2/D3/D15)
- [X] T004 Criar fixtures de leitura `tests/integration/reports/fixtures.ts`:
  `seedLedgerEntry({ type, origin, amount, occurredAt, paymentMethod?, category?, clientId?,
  isActive?, items? })` + limpeza, reutilizando `BARBERSHOP_ID`, `SP`, `upsertUsers` e
  `cleanupLedgerAndBookings` de `tests/integration/ledger/fixtures.ts`. Prover instantes de fuso
  **conhecidos** (ex.: `2026-07-14T01:30:00Z` = 22:30 de 13/07 em SP) e valores que somam em Decimal
  exato; cobrir ativos+inativos, INCOME+EXPENSE, `paymentMethod` variado+`null`, `category`
  variada+`null`, `clientId` próprio/outro/`null`. (bloqueia T005/T010/T019)

**Checkpoint**: fronteira de fuso e fixtures prontas — as histórias podem começar.

---

## Phase 3: User Story 1 + User Story 2 — Caixa e Breakdown por período (Priority: P1) 🎯 MVP

**Goal**: OWNER vê entradas/saídas/saldo de um período (US1) e o breakdown por forma de pagamento e
por categoria (US2), no fuso da barbearia, só lançamentos ativos.

**Independent Test**: abrir `/owner/finance` num período com lançamentos conhecidos e conferir totais,
saldo (inclusive negativo), zeros em período vazio, exclusão de inativos, borda de fuso correta, e
soma dos baldes == totais.

### Tests (test-first — escrever e ver FALHAR antes de implementar) ⚠️

- [ ] T005 [P] [US1] Escrever `tests/integration/reports/cash-summary.test.ts` (deve FALHAR):
  totais income/expense e **saldo** do período (SC-001); **saldo negativo** (saídas > entradas, FR-006);
  **período vazio → "0.00"** em tudo, sem erro (SC-005); **inativo fora** de todo total/balde
  (SC-002); **borda de fuso** 22h/23h local vs. dia UTC seguinte nas **4 granularidades** com semana
  ISO (segunda) (SC-003); **breakdown** por forma (`null` → `UNSET`) e por categoria (`null`
  preservado) com **soma dos baldes == total** (SC-004/FR-009); somas Decimal exatas (**FR-023**/SC-012).

### Implementation

- [ ] T006 [US1] Implementar core `getCashSummaryForOwner` em `src/server/ledger/cash-summary.ts`:
  deriva `[startUtc, endUtc)` via `periodBoundsInZone` (T002); `prisma.$queryRaw` **tipado e
  parametrizado** (`Prisma.sql`, `$tz`/limites como placeholders) com
  `WHERE barbershopId = $shop AND isActive = true AND occurredAt >= $start AND occurredAt < $end`
  (range → índice `(barbershopId, occurredAt)`; nunca função sobre `occurredAt`);
  `COALESCE(SUM(amount) FILTER (WHERE type=...),0)` para income/expense; `GROUP BY paymentMethod`
  (INCOME, `null`→`UNSET`) e `GROUP BY category` (EXPENSE, `null` preservado); tudo em
  `Prisma.Decimal`; `balance = income.minus(expense)`. (US1/US2, FR-001..009, D1/D3/D4/D6/D7)
- [ ] T007 [US1] Rodar `cash-summary.test.ts` até **verde**; confirmar exatidão Decimal (sem float —
  **FR-023**) e invariante soma-dos-baldes == total (SC-004/SC-012).

### UI

- [ ] T008 [P] [US1] Criar `src/components/owner/cash-summary-view.tsx` (server-friendly): exibe
  entradas, saídas, **saldo** (com sinal), breakdown por forma e por categoria com rótulos pt-BR
  (Dinheiro/Pix/Cartão/Online/Outro/**Não informado**/**Sem categoria**). Sem gráficos (FR-026).
- [ ] T009 [US1] Criar Server Component `src/app/owner/finance/page.tsx`: `requireOwner` (redirect
  padrão da F005: visitante→login, cliente→home); resolve `barbershopId` + `timezone`
  (`getOwnerBarbershopId` + leitura de `Barbershop.timezone`); período default **mês corrente**
  (`todayInZone(now, tz)`), granularidade + navegação anterior/próximo via **searchParams**
  (server-rendered, `shiftPeriod`); serializa `CashSummaryResult` → DTO (Decimal→string) e renderiza
  `cash-summary-view`. (US1/US2, FR-002/FR-022, D5) — depende de T006 e T008.

**Checkpoint (MVP)**: caixa + breakdown funcionam e são testáveis isoladamente.

---

## Phase 4: User Story 3 — Razão de lançamentos paginado + filtros (Priority: P2)

**Goal**: OWNER navega o razão (mais recentes primeiro) com keyset, filtros combináveis, expansão de
itens e "mostrar inativos".

**Independent Test**: com um conjunto conhecido, verificar ordem, keyset estável (occurredAt
empatado), filtros em conjunção, itens na expansão e inativos só sob o filtro.

### Tests (test-first) ⚠️

- [ ] T010 [P] [US3] Escrever `tests/integration/reports/ledger-list.test.ts` (deve FALHAR): ordem
  **mais-recente-primeiro**; **keyset** sem repetir/pular com `occurredAt` **empatado** (criar 3+
  linhas no mesmo instante) (SC-006); `pageSize+1`/`hasMore`/`nextCursor`; **filtros combinados** em
  conjunção incl. `UNSET`→`null` (SC-007); **inativos** ausentes por padrão e presentes **marcados**
  sob `includeInactive`, nunca em total (SC-008); e uma linha de **receita** traz seus `items`
  (expansão — FR-014).
- [ ] T010a [US3] Escrever teste de **consistência entre cores** em
  `tests/integration/reports/ledger-list.test.ts` (test-first; **verde após T006 e T011**): para um
  **período+filtros fixos** com dados mistos (INCOME/EXPENSE + **inativos no meio**), paginar
  `listLedgerForOwner` até o fim, somar em `Decimal` (`Σ income − Σ expense`) e comparar com
  `getCashSummaryForOwner().balance` do **mesmo** período/filtros — devem ser iguais; inativos não
  entram em nenhum dos lados. (US3/US1, **FR-024/FR-009/SC-004**)
- [ ] T014 [US3] Escrever teste de **autorização** da action em
  `tests/integration/reports/ledger-list.test.ts` (**test-first**; RED por import inexistente até
  T013): não-OWNER (CLIENT) recusado com `ForbiddenError`; OWNER admitido (mock de sessão no padrão
  dos testes da F005). (SC-011)

### Implementation

- [ ] T011 [US3] Implementar core `listLedgerForOwner` em `src/server/ledger/ledger-list.ts`:
  `findMany` com `orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]`, keyset composto
  `(occurredAt < cur.occurredAt) OR (occurredAt = cur.occurredAt AND id < cur.id)`,
  `take = pageSize + 1`, `where` composto (barbershopId; `isActive: true` ou `{}` se
  `includeInactive`; `type`/`origin`/`paymentMethod`/`category` em conjunção, `UNSET`→`null`;
  `period`→range via `periodBoundsInZone`), `select` enxuto + `include items`. **Comentário** no
  cursor documentando a premissa de precisão: cursor em `Date` (ms) vs `Timestamptz(6)` é seguro
  porque todos os writes da F005 usam `new Date()`. (US3, FR-010..015, D8/D9/D10)
- [ ] T012 [US3] Rodar `ledger-list.test.ts` até **verde** (keyset estável e filtros — SC-006/SC-007/
  SC-008).

### Server Action

- [ ] T013 [US3] Implementar Server Action `src/server/actions/list-ledger.ts`: `requireOwner`
  (FR-022); resolve `barbershopId`+`timezone`; **valida whitelist** de filtro/cursor no servidor
  (enums/campos conhecidos; cursor parseado) (Princípio I); delega ao core; serializa `LedgerPageDTO`
  (Decimal→string, datas→ISO, `nextCursor` serializado). (US3, FR-012/FR-022, D5)

### UI

- [ ] T015 [P] [US3] Criar ilha client `src/components/owner/ledger-browser.tsx`: filtros
  combináveis (tipo/origem/forma/categoria/período/**mostrar inativos**), "carregar mais" (chama
  `listLedger`, acumula páginas via `nextCursor`), **expansão** de itens client-side, **sinal
  visual** do valor pelo `type`, marca linhas inativas. (US3, FR-011..015, D5)
- [ ] T016 [US3] Integrar `ledger-browser` na página `src/app/owner/finance/page.tsx` (render inicial
  da 1ª página server-side + ilha). Estende a página do T009. (US3)

**Checkpoint**: razão navegável e filtrável, independente do caixa.

---

## Phase 5: User Story 4 — Inativar lançamento a partir da listagem (Priority: P2)

**Goal**: cada linha ativa do razão oferece "Inativar (corrigir)" **reutilizando** o soft delete da
F005 sem mudança; qualquer lançamento (não só o último) pode ser inativado.

**Independent Test**: inativar um lançamento que **não** é o último; ele some da lista padrão,
aparece marcado sob "mostrar inativos", sai do caixa/breakdown, e um lançamento de origem agendamento
não reabre o booking.

### Implementation

- [ ] T017 [US4] Ligar o botão **"Inativar (corrigir)"** em cada linha **ativa** de
  `src/components/owner/ledger-browser.tsx`, chamando a **mesma** action da F005
  `deactivateLedgerEntry({ ledgerEntryId })` **SEM MUDANÇA**; após sucesso, recarregar a página atual
  e refletir no caixa/breakdown. **NÃO** editar `deactivate-ledger-entry` (core nem action). (US4,
  FR-016/FR-017/FR-018, D13)
- [ ] T018 [US4] Teste de integração em `tests/integration/reports/ledger-list.test.ts` (ou arquivo
  dedicado): inativar via `deactivateLedgerEntryForOwner` um lançamento que **não** é o último →
  `ledger-list` default o exclui, `includeInactive` o mostra marcado, `cash-summary` não o conta, e
  um lançamento de origem `BOOKING` permanece `COMPLETED` (booking não reabre — **FR-018**). (US4,
  FR-018/SC-009, reutiliza core F005 intacto)

**Checkpoint**: correção utilizável para qualquer lançamento, sem tocar o core da F005.

---

## Phase 6: User Story 5 — Histórico dos próprios gastos do CLIENT (Priority: P3)

**Goal**: usuário autenticado vê suas receitas ativas (clientId = sessão), paginadas por keyset, sem
vazamento.

**Independent Test**: cliente A vê só as próprias receitas ativas; não vê despesas, receitas de B,
anônimos nem inativos; id no input é ignorado.

### Tests (test-first) ⚠️

- [ ] T019 [P] [US5] Escrever `tests/integration/reports/client-history.test.ts` (deve FALHAR): só
  **INCOME ativos** do próprio `clientId` (SC-010); **NÃO** retorna despesas, lançamentos de outro
  cliente, anônimos (`clientId=null`) nem inativos; **keyset idêntico** ao razão; `clientId` **sempre
  da sessão** — a action **não possui** o parâmetro (SC-011); visitante não autenticado recusado na
  action.

### Implementation

- [ ] T020 [US5] Implementar core `listClientHistory` em `src/server/ledger/client-history.ts`:
  `where { clientId: input.userId, type: 'INCOME', isActive: true }`, mesmo keyset/`take = pageSize+1`,
  `select` enxuto (sem type/origin/paymentMethod) + `include items`; mesmo **comentário de precisão**
  do cursor. (US5, FR-019/FR-020, D11)
- [ ] T021 [US5] Implementar Server Action `src/server/actions/list-my-ledger.ts`: `const user =
  await requireUser()` (**não** `requireOwner`); `userId = user.id`; **sem parâmetro `clientId`** na
  assinatura (só `cursor` opcional validado no servidor — FR-021); delega ao core; serializa
  `ClientHistoryPageDTO` (Decimal→string). (US5, FR-019/FR-021)
- [ ] T022 [US5] Rodar `client-history.test.ts` até **verde** (não-vazamento e filtro-da-sessão —
  SC-010/SC-011).

### UI

- [ ] T023 [P] [US5] Criar ilha client `src/components/client/my-spending-list.tsx`: "carregar mais"
  (chama `listMyLedger`), exibe momento/descrição/itens/valor (sem sinal de despesa). (US5, FR-020)
- [ ] T024 [US5] Criar Server Component `src/app/my-spending/page.tsx`: `requireUser` (redirect ao
  login se visitante); resolve o fuso da barbearia (single-shop MVP) para formatar `occurredAt`;
  render da 1ª página + ilha `my-spending-list`. (US5, FR-019/FR-022)

**Checkpoint**: histórico do cliente funciona e não vaza.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 Navegação (F003): adicionar links na nav condicional — **/owner/finance** (só OWNER) e
  **/my-spending** (autenticado) — no header/nav (`src/components/site-header.tsx` /
  `auth-buttons.tsx`, conforme a ilha da F003). Visibilidade é conveniência; a barreira é
  `requireOwner`/`requireUser`. (item 7, FR-022)
- [ ] T026 Simplificar a **superfície de UI** da home do ledger da F005: em
  `src/app/owner/ledger/page.tsx` e `src/components/owner/ledger-manager.tsx`, remover/simplificar o
  banner de "último lançamento" (inativar migrou para a listagem — US4). **NÃO** tocar
  `deactivate-ledger-entry` (core/action) nem outros cores da F005. (item 7/16, FR-025)
- [ ] T027 [P] README: documentar o **balancete** (caixa/breakdown por período) e o **histórico do
  cliente**, incluindo o fuso da barbearia e a paginação keyset. (Princípio V)
- [ ] T028 Regressão: `npm test` (112+ verdes, suites 001–005 intactas) e `npx tsc --noEmit` limpo;
  `git diff` confirma que **nenhum** core/action da F005 foi alterado (só a superfície de UI do
  T026). (FR-025)
- [ ] T029 Smoke manual (roteiro do `quickstart.md`): caixa nas **4 granularidades** com navegação
  anterior/próximo; borda de fuso visual (lançamento 22:30 local no dia certo); filtros combinados;
  "carregar mais" 2x; inativar um lançamento **antigo** e ver o caixa refletir; histórico do CLIENT
  sem vazamento (A não vê B/despesas/anônimos/inativos). (SC-001..SC-011)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **BLOQUEIA** todas as histórias (T002 e T004 são
  usados por todas as fases de teste/impl).
- **US1+US2 (Phase 3)**: depende da Foundational. **MVP**.
- **US3 (Phase 4)**: depende da Foundational; a UI (T016) estende a página criada em US1 (T009).
- **US4 (Phase 5)**: depende de US3 (o botão vive nas linhas do `ledger-browser`).
- **US5 (Phase 6)**: depende da Foundational; independente de US1–US4.
- **Polish (Phase 7)**: depende das histórias desejadas concluídas.

### User Story Dependencies

- **US1+US2 (P1/P2)**: independentes (só Foundational).
- **US3 (P2)**: independente; compartilha a página `/owner/finance` com US1/US2 (integração
  sequencial, não paralela no mesmo arquivo).
- **US4 (P2)**: depende de US3 (superfície da listagem).
- **US5 (P3)**: totalmente independente das demais.

### Within Each User Story

- Testes (test-first) escritos e **FALHANDO** antes da implementação do core.
- Core antes da Server Action; Server Action antes da UI; UI por último.
- **T010a** (consistência caixa×listagem) é escrito no lote test-first de US3, mas fica **verde só
  após T006** (core cash-summary, US1) **e T011** (core ledger-list).

### Parallel Opportunities

- Foundational: **T003** (teste do helper, RED) **precede** **T002** (impl do helper); **T004**
  (fixtures) [P] com ambos — arquivos diferentes.
- Dentro de US1/US2: **T008** (view) [P] em paralelo com o core/teste (T005–T007), arquivos
  diferentes; T009 (page) integra ambos.
- Dentro de US3: **T015** (ilha) [P] em paralelo com core/action; T016 integra.
- Dentro de US5: **T023** (ilha) [P] em paralelo com core/action; T024 integra.
- **US5 inteira** pode ser desenvolvida em paralelo a US1–US4 por outra pessoa (arquivos disjuntos).

---

## Parallel Example: User Story 1 + 2

```bash
# Teste test-first (deve falhar) e a view podem ser preparados em paralelo:
Task T005: "Escrever cash-summary.test.ts (RED) em tests/integration/reports/"
Task T008: "Criar cash-summary-view.tsx em src/components/owner/"
# Depois: T006 (core) -> T007 (verde) -> T009 (page integra core + view)
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 (Setup) → Phase 2 (Foundational — bloqueia tudo).
2. Phase 3 (Caixa + Breakdown) test-first.
3. **PARAR e VALIDAR**: caixa e breakdown num período conhecido (totais, zeros, inativo fora, borda
   de fuso, soma=total).
4. Demo do balancete básico.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1+US2 (caixa/breakdown) → testar → demo (**MVP**).
3. US3 (razão) → testar → demo.
4. US4 (inativar na listagem, reuso F005) → testar → demo.
5. US5 (histórico do cliente) → testar → demo.
6. Polish (nav, README, regressão, smoke).

### Nota de disciplina (test-first dos cores)

Os três cores de leitura (`cash-summary`, `ledger-list`, `client-history`) são **test-first**: cada
teste de integração é escrito para **falhar** antes do core existir (RED → GREEN). Se preferir a
ordem "todos os cores primeiro", basta executar T005–T007, T010–T012 e T019–T022 antes das camadas de
action/UI — as fases permanecem independentemente entregáveis.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Todo dinheiro trafega como **string** (Decimal serializado) na fronteira Server→Client.
- **Reuso intacto**: `deactivateLedgerEntry` (core e action) da F005 **não** é editado (T017/T018 só o
  consomem). Se algo exigir mudança lá → **PARAR e reportar** (Princípio VI).
- Verificar os testes **falhando** antes de implementar cada core.
- Commit após cada task ou grupo lógico (Conventional Commits, escopo `(006)`, corpo ASCII).
- Parar em qualquer checkpoint para validar a história isoladamente.
