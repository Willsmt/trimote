# Tasks: Remarcar Agendamento

**Input**: Design documents from `specs/004-reschedule-booking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/reschedule-booking.md](./contracts/reschedule-booking.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUÍDOS — a Constituição (Princípio IV, Test-First) é não-negociável para a lógica de
**disponibilidade/conflito**; plan/research/quickstart pedem testes de integração em
`tests/integration/reschedule/` (Postgres no ar, pela garantia viver no banco).

**Organization**: Tarefas agrupadas por user story (P1 → P2 → P3) para entrega incremental.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 / US2 / US3 (mapeia o spec)

## ⚠️ Nota de arquitetura (segurança primeiro + arquivo compartilhado)

**Segurança primeiro (Princípio I)**: o **enforcement** de posse/elegibilidade
(`not_owner`/`not_active`/`booking_in_past`) vive na **Foundational** (T005), no topo do core e na
Server Action, **antes** de qualquer trabalho ou UPDATE — assim o MVP (US1) já nasce seguro no servidor.
Os **testes de recusa** dessas guardas e o cenário de **concorrência** permanecem na **US3** (story de
proteções). O Princípio IV (test-first não-negociável) incide sobre **disponibilidade/conflito**
(exclude-self e colisão, que têm teste-primeiro em T002 e T008); guardas de posse não são "domínio de
disponibilidade/conflito", então seu teste ficar na US3 é compatível com a Constituição.

**Ordem de verificação final do core** `src/server/booking/reschedule-booking.ts` (curto-circuito, sem
efeito colateral em nenhuma recusa — FR-009):

```
not_found → not_owner (posse) → not_active + booking_in_past (elegibilidade: ativo + futuro)
  → no_change → service_not_found + service_inactive (condicional de troca)
  → in_the_past + outside_opening_hours → UPDATE ($transaction) / 23P01 → slot_unavailable
```

**Arquivo compartilhado**: T005 (guardas, Foundational) → T009 (US1 happy-path) → T015 (US2 serviço)
editam o **mesmo** `reschedule-booking.ts` → **sequenciais** entre si (não `[P]`). US3 **não** toca mais
o core (só testes + UI).

---

## Phase 1: Setup

**Purpose**: Preparar a base de testes de integração da feature (sem tocar código de produção).

- [X] T001 Criar a pasta `tests/integration/reschedule/` e um helper de fixtures reutilizando o padrão
  de setup de integração já existente (seed de barbershop + user + serviço ativo + booking `ACTIVE`
  futuro; limpeza entre testes). Reusar utilitários de tempo `src/domain/time` e `localDateTimeToUtc`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infra compartilhada por todas as stories + **enforcement de segurança** no servidor.
**Nenhuma story começa antes desta fase.**

**⚠️ CRITICAL**: exclude-self na disponibilidade, esqueleto do core/Server Action e as **guardas de
posse/elegibilidade** são pré-requisito de US1/US2/US3.

- [X] T002 [P] (test-first) Escrever o teste de integração **exclude-self** em
  `tests/integration/reschedule/exclude-self.test.ts`: `getAvailableSlots({ serviceId, date, excludeBookingId })`
  para o dia do próprio booking **inclui** o horário atual do booking e as adjacências válidas (deve
  **falhar** antes de T003). Cobre FR-002/FR-004 (D1) e o teste #1 do quickstart.
- [X] T003 Adicionar o parâmetro **opcional** `excludeBookingId?: string` a `getAvailableSlots` em
  `src/server/actions/get-available-slots.ts`: quando presente, incluir `id: { not: excludeBookingId }`
  no `where` da busca de `activeBookings`. Sem o parâmetro, comportamento **idêntico** ao atual
  (retrocompatível); `computeAvailableSlots` (domínio puro) **não** muda. Faz T002 passar. (ÚNICO
  arquivo da 001 alterado.)
- [X] T004 Criar o esqueleto do core e da Server Action (sem regra de negócio ainda):
  `src/server/booking/reschedule-booking.ts` com os tipos `RescheduleBookingInput`,
  `RescheduleBookingReason` (incl. `not_found`, `not_owner`, `not_active`, `booking_in_past`,
  `service_not_found`, `service_inactive`, `no_change`, `in_the_past`, `outside_opening_hours`,
  `slot_unavailable`), `RescheduleBookingResult` e a assinatura de
  `rescheduleBookingForUser({ userId, bookingId, serviceId, startsAt, now? })`; e o arquivo da Server
  Action fina `src/server/actions/reschedule-booking.ts` (`"use server"`).
- [X] T005 **(enforcement — segurança primeiro)** Implementar no topo do core
  `src/server/booking/reschedule-booking.ts` as guardas de **posse e elegibilidade**, com curto-circuito
  e **sem efeito colateral** (FR-007/FR-008/FR-009/FR-010): carregar booking (`id`, `userId`, `status`,
  `startsAt`, `serviceId`) → ausente `not_found`; `booking.userId !== userId` → `not_owner`;
  `booking.status !== "ACTIVE"` → `not_active`; `booking.startsAt <= now` → `booking_in_past` (fronteira
  pelo **início**). Finalizar a Server Action `src/server/actions/reschedule-booking.ts` para derivar
  `userId` via `requireUser()`, converter `startsAt` ISO→`Date` e delegar ao core (padrão de
  `cancel-booking.ts`). (Os **testes** dessas recusas ficam na US3 — T017.)

**Checkpoint**: disponibilidade com exclude-self pronta + entrypoint de remarcação **já seguro** no
servidor (posse/elegibilidade recusadas antes de qualquer trabalho) → stories podem começar.

---

## Phase 3: User Story 1 - Mover para outro horário (Priority: P1) 🎯 MVP

**Goal**: O dono move um agendamento ativo futuro para um horário livre, **mantendo a identidade**; o
horário antigo é liberado automaticamente. Mesmo serviço.

**Independent Test**: como dono, abrir Remarcar, escolher um horário livre, confirmar → o booking
(mesma `id`) aparece no novo horário e o horário antigo volta a ser ofertado como livre.

### Tests for User Story 1 (test-first — devem FALHAR antes da implementação) ⚠️

- [X] T006 [P] [US1] Teste de integração **mover + liberar** em
  `tests/integration/reschedule/move-and-release.test.ts`: `rescheduleBookingForUser` move o booking
  (mesma `id`) para horário livre; depois `getAvailableSlots` (sem exclude) volta a ofertar o horário
  **antigo** (FR-001/FR-003, SC-001/SC-003).
- [X] T007 [P] [US1] Teste de integração **no_change** em
  `tests/integration/reschedule/no-change.test.ts`: mesmo `serviceId` **e** mesmo `startsAt` →
  `{ ok: false, reason: "no_change" }` sem UPDATE (FR-012).
- [X] T008 [P] [US1] Teste de integração **conflito/concorrência** em
  `tests/integration/reschedule/conflict.test.ts`: alvo ocupado por outro booking `ACTIVE` →
  `slot_unavailable`; o booking original permanece intacto (FR-006/FR-009, SC-007).

### Implementation for User Story 1

- [X] T009 [US1] Implementar o caminho de move no core `src/server/booking/reschedule-booking.ts`,
  **abaixo das guardas de T005**: checar `no_change` (mesmo serviceId+startsAt → recusa amigável, sem
  UPDATE); carregar o serviço escolhido → ausente `service_not_found`; revalidar alvo
  (`startsAt <= now` → `in_the_past`) e encaixe no expediente (`outside_opening_hours`) no fuso
  `America/Sao_Paulo`; recalcular `endsAt = startsAt + service.durationMinutes`; `prisma.$transaction`
  com **UPDATE da mesma linha**; traduzir `23P01`/`booking_no_overlap` → `slot_unavailable` **reusando**
  `isExclusionViolation` de `src/server/booking/create-booking.ts`. (Faz T006/T007/T008 passarem.)
- [X] T010 [P] [US1] Adicionar a ação **"Remarcar"** em `src/components/my-bookings-list.tsx`, exibida
  apenas para bookings `ACTIVE` **e futuros** (conveniência; o servidor revalida — FR-010), linkando
  para a página de remarcação.
- [X] T011 [US1] Criar a página `src/app/my-bookings/[id]/reschedule/page.tsx`: exigir sessão
  (`requireUser`), carregar o booking e validar posse no servidor, carregar serviços ativos e renderizar
  o flow (espelha `src/app/booking/page.tsx`).
- [X] T012 [US1] Criar `src/components/reschedule-flow.tsx` (client) para o caso **mesmo serviço**:
  escolher dia/horário chamando `getAvailableSlots` com `excludeBookingId = bookingId`, confirmar →
  `rescheduleBooking`; mapear `reason` → mensagem amigável (`no_change`: "Esse já é o horário e serviço
  atuais do agendamento."; `slot_unavailable`: "Horário indisponível. Escolha outro.").

**Checkpoint**: US1 funcional, testável e **segura no servidor** — MVP entregável (mover mantendo
identidade + liberar antigo, com posse/elegibilidade já garantidas por T005).

---

## Phase 4: User Story 2 - Trocar o serviço ao remarcar (Priority: P2)

**Goal**: Opcionalmente trocar o serviço na remarcação; só ofertar horários onde o **novo** serviço
cabe inteiro; recusar troca para serviço inativo.

**Independent Test**: trocar para um serviço de duração diferente → só aparecem horários onde ele cabe;
confirmar reflete novo serviço+horário (mesma id). Trocar para serviço inativo → recusado; manter o
serviço atual (mesmo inativo) → não bloqueia.

### Tests for User Story 2 (test-first) ⚠️

- [X] T013 [P] [US2] Teste de integração **troca de serviço / encaixe** em
  `tests/integration/reschedule/service-change.test.ts`: trocar para serviço de duração maior — só
  horários onde cabe inteiro são aceitos; alvo onde não cabe → `outside_opening_hours` (FR-004, SC-002).
- [X] T014 [P] [US2] Teste de integração **service_inactive** em
  `tests/integration/reschedule/service-inactive.test.ts`: `serviceId !== booking.serviceId` e serviço
  inativo → `service_inactive`; **manter** o serviço atual (mesmo que inativo) → NÃO bloqueia (FR-014,
  SC-009).

### Implementation for User Story 2

- [X] T015 [US2] Estender o core `src/server/booking/reschedule-booking.ts` (no bloco de serviço,
  **depois** do `no_change`): se `serviceId !== booking.serviceId` **e** serviço escolhido inativo
  (`isActive === false`) → `service_inactive` (se **mantém** o serviço atual, **não** checa `isActive`);
  `endsAt` e o encaixe no expediente passam a usar a duração do **serviço escolhido** (FR-004/FR-014).
- [X] T016 [US2] Estender `src/components/reschedule-flow.tsx`: seletor de serviço (apenas ativos,
  default = serviço atual); ao trocar, recalcular horários via `getAvailableSlots(novo serviceId,
  excludeBookingId)`; mensagens para `service_inactive` ("Esse serviço não está mais disponível. Escolha
  outro.") e `service_not_found`.

**Checkpoint**: US1 e US2 funcionam de forma independente (mover e/ou trocar serviço).

---

## Phase 5: User Story 3 - Proteções e recusas (Priority: P3)

**Goal**: **Assegurar por teste** que só o dono remarque, só ativos e futuros, e que a concorrência é
recusada sem mover o agendamento. (O **enforcement** dessas guardas já está em T005 — Foundational.)

**Independent Test**: tentar remarcar (a) booking de outro cliente, (b) cancelado, (c) passado, (d) alvo
recém-ocupado por concorrência → todas recusadas com mensagem clara e sem mover o agendamento.

### Tests for User Story 3 (asseguram as recusas do enforcement de T005) ⚠️

- [X] T017 [P] [US3] Teste de integração **ownership/elegibilidade** em
  `tests/integration/reschedule/ownership.test.ts`: `not_owner` (booking de outro), `not_active`
  (cancelado), `booking_in_past` (source já iniciado/passado) — nenhuma recusa altera o booking
  (FR-007/FR-008/FR-009, SC-005/SC-006). Exercita as guardas implementadas em T005.
- [X] T018 [P] [US3] Teste de integração **alvo no passado + integridade sob concorrência** em
  `tests/integration/reschedule/refusals.test.ts`: alvo `in_the_past` recusado; sob concorrência o
  original permanece intacto (FR-005, SC-004/SC-007).

### Implementation for User Story 3

- [X] T019 [US3] Garantir em `src/components/my-bookings-list.tsx` que "Remarcar" **não** aparece para
  bookings cancelados nem passados (conveniência de UI; o servidor continua sendo a barreira — FR-010).

**Checkpoint**: todas as stories independentes; garantias de segurança/integridade **implementadas
(T005) e cobertas por teste (T017/T018)**.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] Atualizar o `README` com a remarcação (fluxo, reasons, escopo) — Princípio V (Convenções).
- [X] T021 [P] Revisar o mapa completo `reason → mensagem amigável` na UI (todas as reasons do contrato
  cobertas, textos em português) em `src/components/reschedule-flow.tsx`.
- [ ] T022 Regressão + validação: `npm test` verde (agendar/cancelar/disponibilidade/owner intactos —
  001/002 não enfraquecidas) e executar o smoke manual do [quickstart](./quickstart.md) C1–C4.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **BLOQUEIA** todas as stories (exclude-self + esqueleto
  + **enforcement de posse/elegibilidade**).
- **User Stories (Phase 3–5)**: dependem da Foundational.
- **Polish (Phase 6)**: depois das stories desejadas.

### User Story Dependencies

- **US1 (P1)**: começa após a Foundational. É o MVP (já seguro, pois T005 impôs posse/elegibilidade).
- **US2 (P2)**: após a Foundational; estende o core e o flow de US1 → na prática, após US1.
- **US3 (P3)**: após a Foundational; **só testes + UI** (o enforcement já existe em T005), então pode
  rodar em paralelo às demais desde que T005 esteja pronto.

### Restrição de arquivo compartilhado (core)

- T005 (guardas), T009 (US1 move) e T015 (US2 serviço) editam **o mesmo** `reschedule-booking.ts` →
  **sequenciais** (T005 → T009 → T015), não `[P]`. `reschedule-flow.tsx`: T012 (US1) → T016 (US2).
- US3 **não** toca o core — T019 é UI; T017/T018 são testes.

### Parallel Opportunities

- Testes `[P]` de cada story em paralelo entre si: T006+T007+T008 (US1); T013+T014 (US2);
  T017+T018 (US3).
- T010 (UI list) `[P]` em relação ao core de US1. T020 e T021 (Polish) `[P]`.

---

## Parallel Example: User Story 1

```bash
# Testes de US1 juntos (test-first, devem falhar antes da impl):
Task: "move-and-release.test.ts (mover + liberar)"     # T006
Task: "no-change.test.ts (no_change)"                  # T007
Task: "conflict.test.ts (conflito/concorrência)"       # T008
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational: exclude-self + esqueleto + **enforcement de segurança**)
   → 3. Phase 3 (US1) → **PARAR e VALIDAR** o move ponta a ponta → demo do MVP **já seguro no servidor**.

### Incremental Delivery

Setup + Foundational → US1 (MVP: mover) → US2 (trocar serviço) → US3 (testes de proteção + UI). Cada
incremento agrega valor sem quebrar o anterior; a regressão (T022) confirma 001/002 intactas.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- Test-first: os testes de **disponibilidade/conflito** (T002, T008) devem **falhar** antes da impl
  (Princípio IV, não-negociável). O enforcement de posse (T005) sobe por **segurança primeiro**
  (Princípio I); seus testes de recusa ficam na US3 (T017), conforme decisão do autor.
- Reuso máximo da 001/002: `computeAvailableSlots` (puro, inalterado), `isExclusionViolation`,
  `requireUser`, `src/domain/time`. Único arquivo da 001 alterado: `get-available-slots.ts` (T003).
- Sem migration (D7): a remarcação opera sobre colunas existentes de `Booking`.
- Commit por task ou grupo lógico; parar em qualquer checkpoint para validar a story isoladamente.
