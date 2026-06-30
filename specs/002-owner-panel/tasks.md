---

description: "Task list for feature 002-owner-panel"
---

# Tasks: Painel do Dono — Gerenciar Serviços e Horários

**Input**: Design documents from `specs/002-owner-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/owner-actions.md, quickstart.md

**Tests**: Incluídos **apenas** onde a Constituição (Princípio IV) os torna obrigatórios — o **guard de
autorização** (não-dono barrado no servidor) e o **ciclo de vida do serviço** (soft-delete preservando
booking + unicidade de nome entre ativos). Test-first: escritos e falhando antes da implementação.

**Organization**: Tarefas agrupadas por user story. Reusa a fundação da 001; toca código da 001 apenas
no filtro `isActive` de `listServices` (Princípio VI).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1, US2, US3 (mapeia para as user stories da spec.md)

## Path Conventions

Projeto único Next.js (App Router): `prisma/`, `src/app/owner/`, `src/server/{auth,actions,owner}/`,
`src/components/owner/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparação mínima (a stack já existe da 001; sem dependências novas).

- [ ] T001 Criar a estrutura de diretórios da feature: `src/app/owner/`, `src/server/owner/`, `src/components/owner/`, `tests/integration/owner-authorization/`, `tests/integration/service-lifecycle/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migrations, seed e o guard de autorização — exigidos por todas as user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase.

- [ ] T002 Atualizar `prisma/schema.prisma`: adicionar `enum Role { CLIENT, OWNER }`, campo `role Role @default(CLIENT)` em `User`, e `isActive Boolean @default(true)` em `BarbershopService`
- [ ] T003 Gerar e aplicar a migration com `prisma migrate dev --name owner_panel` (enum/role/isActive) em `prisma/migrations/` — **toca o banco**
- [ ] T004 Editar a migration gerada para adicionar, em SQL manual, o índice único parcial de nome entre ativos: `CREATE UNIQUE INDEX barbershopservice_active_name_key ON "BarbershopService"("name") WHERE "isActive" = true` (research.md D4) e reaplicar
- [ ] T005 Adicionar ao `prisma/seed.ts` (ou script dedicado) a promoção de um usuário a `OWNER` via e-mail de env (ex.: `OWNER_EMAIL`), sem UI de gestão de usuários (FR-001a)
- [ ] T006 [P] Teste de integração (test-first, deve FALHAR) do core do guard em `tests/integration/owner-authorization/guard.test.ts`: `assertOwnerRole` nega usuário `CLIENT` (forbidden) e admite `OWNER`; ausência de usuário ⇒ unauthorized
- [ ] T007 Implementar o guard em `src/server/auth/owner.ts`: `assertOwnerRole(userId)` (lê `role` do banco por requisição — research.md D2) e `requireOwner()` (sessão → userId → `assertOwnerRole`), com `ForbiddenError`/`UnauthorizedError`, até T006 passar

**Checkpoint**: Fundação pronta — role/isActive no banco, índice parcial, seed de OWNER e guard prontos.

---

## Phase 3: User Story 1 - Gerenciar serviços (Priority: P1) 🎯 MVP

**Goal**: Dono cria, edita e desativa serviços; a listagem pública reflete só os ativos; histórico e
agendamentos preservados.

**Independent Test**: Como dono, criar um serviço e vê-lo em `/services`; editar preço/duração;
desativar um serviço com booking ativo e confirmar que o booking permanece íntegro e o serviço some da
oferta.

### Tests for User Story 1 (test-first — Princípio IV) ⚠️

- [ ] T008 [P] [US1] Teste de integração do ciclo de vida em `tests/integration/service-lifecycle/lifecycle.test.ts`: desativar serviço com booking ativo futuro preserva o booking (sem delete físico); o índice parcial rejeita nome duplicado entre **ativos** (`name_taken`) mas permite reusar o nome de um serviço **inativo**; editar duração **não** altera o `endsAt` de bookings existentes (FR-005/FR-006/FR-007/FR-012)

### Implementation for User Story 1

- [ ] T009 [US1] Implementar o core de serviços em `src/server/owner/services.ts`: `createService`, `updateService`, `deactivateService`, `reactivateService`, `listServicesForOwner` — validação de input (nome não vazio, `price >= 0`, `durationMinutes > 0`) e tradução da violação do índice parcial (`23505`) em `name_taken`; até T008 passar
- [ ] T010 [US1] Implementar as Server Actions em `src/server/actions/` (`create-service.ts`, `update-service.ts`, `deactivate-service.ts`, `reactivate-service.ts`, `list-services-for-owner.ts`) como wrappers que chamam `requireOwner` e delegam ao core
- [ ] T011 [US1] Ajustar a listagem pública da 001 em `src/server/actions/list-services.ts` para filtrar `where: { isActive: true }` — **único toque na 001** (FR-006/Princípio VI), sem outra mudança de comportamento
- [ ] T012 [US1] Construir a UI de gestão de serviços em `src/app/owner/services/page.tsx` (+ componentes em `src/components/owner/`): listar (ativos/inativos), criar, editar, desativar/reativar — com guarda `requireOwner` na página

**Checkpoint**: US1 funcional e testável — catálogo gerenciável com integridade preservada.

---

## Phase 4: User Story 2 - Gerenciar horário de funcionamento (Priority: P2)

**Goal**: Dono define abertura/fechamento por dia ou marca o dia como fechado; a disponibilidade
futura reflete a mudança, sem cancelar bookings existentes.

**Independent Test**: Como dono, reduzir o fechamento de um dia e confirmar que a disponibilidade
pública daquele dia respeita o novo horário; marcar um dia como fechado e confirmar que nenhum horário
é oferecido; um booking existente fora do novo expediente permanece.

### Implementation for User Story 2

- [ ] T013 [US2] Implementar o core de expediente em `src/server/owner/opening-hours.ts`: `setOpeningHours` (valida `closesAtMinutes > opensAtMinutes`, upsert por `(barbershopId, weekday)`) e `closeDay` (remove a janela do weekday) — sem qualquer escrita em `Booking` (FR-009/FR-011)
- [ ] T014 [US2] Implementar as Server Actions `setOpeningHours`/`closeDay` em `src/server/actions/` como wrappers que chamam `requireOwner` e delegam ao core
- [ ] T015 [US2] Construir a UI de expediente em `src/app/owner/opening-hours/page.tsx` (+ componentes): editar abertura/fechamento por dia e marcar dia como fechado — com guarda `requireOwner`

**Checkpoint**: US1 e US2 funcionam; a disponibilidade da 001 passa a refletir o expediente gerenciado.

---

## Phase 5: User Story 3 - Acesso restrito ao painel (Priority: P3)

**Goal**: Apenas o dono acessa o painel e suas operações; visitante e cliente comum são barrados no
servidor.

**Independent Test**: Tentar acessar `/owner` e as ações de gestão como visitante e como `CLIENT` —
ambos barrados; como `OWNER`, acesso concedido.

### Implementation for User Story 3

- [ ] T016 [US3] Aplicar a guarda `requireOwner` na entrada do painel `src/app/owner/page.tsx` e garantir que todas as subpáginas (`services`, `opening-hours`) e Server Actions de gestão a invoquem; não-dono é redirecionado/recusado (FR-001)
- [ ] T017 [P] [US3] Teste de integração em `tests/integration/owner-authorization/lockdown.test.ts`: para cada operação de gestão (create/update/deactivate/reactivate service, setOpeningHours, closeDay) o core de role nega `CLIENT` e admite `OWNER`, confirmando o lockdown abrangente (FR-001, SC-001)

**Checkpoint**: Painel totalmente protegido; todas as US independentemente funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Acabamento e preocupações transversais.

- [ ] T018 [P] Atualizar o `README.md` com a seção do painel do dono: rota `/owner`, papéis `CLIENT/OWNER` e a promoção a `OWNER` via seed/script (`OWNER_EMAIL`) (Princípio V)
- [ ] T019 [P] Revisar as Server Actions de gestão garantindo tratamento de erro explícito e mensagens sem dados sensíveis (Princípios I/III)
- [ ] T020 Executar os cenários do `quickstart.md` de ponta a ponta e confirmar no banco o default de `role` e o índice `barbershopservice_active_name_key`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — **BLOQUEIA** todas as user stories (schema, migrations, guard)
- **User Stories (Phase 3+)**: dependem da Foundational. US1 e US2 são independentes entre si; US3
  formaliza o lockdown (o guard já existe na Foundational e é usado por US1/US2)
- **Polish (Phase 6)**: depende das user stories desejadas

### User Story Dependencies

- **US1 (P1)**: após Foundational — independente
- **US2 (P2)**: após Foundational — independente de US1
- **US3 (P3)**: após Foundational — usa o guard (Foundational) já consumido por US1/US2; aqui garante o
  lockdown nas páginas e o teste abrangente

### Within Each User Story

- Testes obrigatórios (guard, ciclo de vida) escritos e **falhando** antes da implementação
- Core (`src/server/owner`) antes das Server Actions; Server Actions antes da UI
- Guarda `requireOwner` em toda página e ação de gestão

### Parallel Opportunities

- Foundational: T006 (teste do guard) em paralelo com T002–T005
- US1: T008 (teste) primeiro; core/actions/UI em sequência
- US3: T017 (teste) em paralelo com T016
- Polish: T018, T019 em paralelo

---

## Parallel Example: User Story 1

```bash
# Teste da US1 primeiro (test-first, deve falhar):
Task: "Ciclo de vida de servico em tests/integration/service-lifecycle/lifecycle.test.ts"  # T008
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational (CRÍTICA — role/isActive, índice parcial, guard)
3. Phase 3: User Story 1 (gerenciar serviços)
4. **PARAR e VALIDAR**: criar/editar/desativar serviço; booking preservado
5. Demo

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → testar → demo (MVP do painel!)
3. US2 → testar → demo
4. US3 → reforçar lockdown → demo

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente
- Testes obrigatórios apenas no guard de autorização e no ciclo de vida do serviço (Princípio IV)
- Server Actions de gestão são wrappers finos sobre o core em `src/server/owner/`, sempre via `requireOwner`
- Único toque na 001: filtro `isActive` em `listServices` (Princípio VI)
- Conventional Commits; objetos/código em inglês, docs/comentários em português (Princípio V)
