---

description: "Task list for 007-multi-tenancy"
---

# Tasks: Multi-tenancy — Negócios, Donos e Administração

**Input**: Design documents from `specs/007-multi-tenancy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (admin, active-business,
business-scoping, public-slug)

**Tests**: INCLUÍDOS e **test-first** para a lógica crítica da onda 2 (guards, anti-escalação, slug,
backfill, **isolamento por negócio**). A **regressão dos 139 é gate**, não formalidade.

**Organization**: por **ONDAS** (espelhando as duas migrations do plano), com **gate bloqueante**
entre elas. Dentro da onda 2, por user story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: arquivos diferentes, sem dependência pendente. **[Story]**: US1..US6.

## Regras invioláveis (do briefing)

- **NENHUMA task da ONDA 2 inicia antes do GATE da ONDA 1** (T0xx: 139 verdes + tsc limpo).
- `deactivate-ledger-entry` e demais cores da F005/F006: **só rename** na onda 1; **zero** mudança de
  lógica em qualquer onda.
- Migration 1 = **SQL hand-edited** (`ALTER TABLE RENAME`); o Prisma gerado ingenuamente faria
  DROP+CREATE (perda de dados/constraint).
- `businessId` **nunca** vem do input em operação de dono (deriva do negócio ativo da sessão).
- Nenhuma Server Action pública escreve `User.role` ou cria `BusinessMember`.
- Commits Conventional Commits escopo `(007)`, corpo ASCII; cada task referencia FR/US/SC.

---

## Phase 1: Setup

- [X] T001 Criar branch `007-multi-tenancy` a partir de `main` e o diretório `tests/integration/multitenancy/`.
  Confirmar base atual (um negócio de seed + dados F001–F006) e 139 testes verdes como ponto de partida.

---

## Phase 2: ONDA 1 — Rename puro (mecânica, zero lógica) 🚧 BLOQUEIA TUDO

**Purpose**: `Barbershop→Business`, `BarbershopService→Service`, `barbershopId→businessId`, + coluna
`segment` — **sem mudar comportamento**. Termina no GATE (139 verdes).

- [X] T002 Editar `prisma/schema.prisma`: renomear model `Barbershop`→`Business` (+ `segment String
  @default("barbershop")`), `BarbershopService`→`Service`, campo/relations `barbershopId`→`businessId`
  em `OpeningHours`/`Service`/`Booking`/`LedgerEntry` e `barbershop`→`business`; ajustar `@@unique`/
  `@@index` renomeados. (FR-001/FR-003)
- [X] T003 Gerar a migration **sem aplicar**: `npx prisma migrate dev --create-only --name
  rename_business`; **EDITAR À MÃO** o SQL em `prisma/migrations/<ts>_rename_business/migration.sql`
  para `ALTER TABLE "Barbershop" RENAME TO "Business"`, `ALTER TABLE "BarbershopService" RENAME TO
  "Service"`, `ALTER TABLE ... RENAME COLUMN "barbershopId" TO "businessId"` (Booking/OpeningHours/
  Service/LedgerEntry) e `ADD COLUMN "segment" text NOT NULL DEFAULT 'barbershop'`. **NUNCA** deixar
  DROP/CREATE de tabela. (FR-001/FR-002)
- [X] T004 Aplicar e regenerar o client: `npx prisma migrate dev` + `npx prisma generate`. (FR-001)
- [X] T005 **Validação da constraint (bloqueante)**: `pg_constraint` prova que `booking_no_overlap`
  existe e referencia `"businessId"` (`EXCLUDE USING gist ("businessId" WITH =, tstzrange(...) WITH
  &&) WHERE status='ACTIVE'`). Registrar o output no PR/commit. (FR-002/SC-008)
- [X] T006 Renomear as referências nos **cores/actions** do servidor: `prisma.barbershop`→
  `prisma.business`, `prisma.barbershopService`→`prisma.service`, param/campo `barbershopId`→
  `businessId`, relation `barbershop`→`business` em `src/server/owner/{services,opening-hours,
  barbershop}.ts`, `src/server/booking/{create-booking,reschedule-booking}.ts`, `src/server/ledger/*`,
  `src/server/actions/*`, e `src/server/db/client.ts` (filtro do logger do Prisma:
  `target.startsWith("barbershopService.")` → `"service."` + comentário). **Zero mudança de lógica.**
  Critério: pós-onda-1, **zero hits** de `barbershop` em `src/` e `tests/`. (FR-001)
- [X] T007 [P] Renomear referências nas **pages/componentes**: `src/app/owner/**`, `src/app/booking/
  page.tsx`, `src/app/services/page.tsx`, `src/app/my-bookings/**`, `src/components/**` (só nomes de
  campo/relation/model). (FR-001)
- [X] T008 [P] Renomear as **fixtures e suites**: `BARBERSHOP_ID`→`BUSINESS_ID`, `prisma.
  barbershopService`→`prisma.service`, `barbershopId`→`businessId` em `tests/integration/**/fixtures.ts`
  e nas suites que os usam. **Mantém 1 business nesta onda.** (FR-001/FR-025)
- [X] T009 🔒 **GATE DA ONDA 1 (bloqueante)**: `npm test` = **139/139 verdes** e `npx tsc --noEmit`
  limpo com os nomes novos; `git diff` confirma **só renomeação** (zero lógica). **Commit da onda 1
  fecha aqui.** Nenhuma task da onda 2 começa antes disto. (FR-025/SC-006)

**Checkpoint**: rename provado por 139 verdes + constraint viva. Onda 2 liberada.

---

## Phase 3: ONDA 2 — Fundação funcional (Migration 2 + backfill) — [US6] 🚧 BLOQUEIA US1–US5

**Purpose**: schema funcional + backfill sem perda. Bloqueia as histórias.

- [X] T010 [US6] Editar `prisma/schema.prisma` (onda 2): `enum Role { CLIENT, OWNER, ADMIN }`
  (ADMIN aditivo); `enum BusinessRole { OWNER }`; `model BusinessMember { id cuid, userId FK (relation
  "Membership"), businessId FK, role BusinessRole, createdAt Timestamptz(6), createdBy FK (relation
  "MembershipCreatedBy"), @@unique([userId, businessId]) }`; `Business.slug String @unique` +
  `createdBy String?`/`createdAt`; `Session.activeBusinessId String?` FK→Business `onDelete: SetNull`;
  relations em User (`memberships`, `membershipsCreated`). (FR-004/FR-011/FR-012/FR-023, US2/US6)
- [X] T011 [US6] Gerar a migration 2 (`--name multitenancy`) e escrever o **backfill** no corpo dela
  (SQL) ou script acoplado: business existente ganha `slug` derivado do nome via `slugify`, validado
  contra a **regra completa** (regex + unicidade + `RESERVED_SLUGS`) com **fallback determinístico**
  (sufixo, ex.: `-1`/id curto) se o derivado for reservado ou colidir; cada `User` com `role='OWNER'`
  ganha `BusinessMember(…, OWNER, createdBy=self)` e é **rebaixado** a `CLIENT`. (FR-024/FR-023, US6)
  — ver research D4.
- [X] T012 [US6] Bootstrap do 1º ADMIN em `prisma/seed.*` (idempotente, documentado): promover
  `willmarthins@gmail.com` a `Role.ADMIN`. Aplicar migration + seed. (FR-022, US1/US6)
- [X] T013 [US6] Estender as fixtures de teste `tests/integration/multitenancy/fixtures.ts`: helper p/
  criar **Business** + **BusinessMember(OWNER)**, um **2º business** (+ 2º owner) para os testes de
  isolamento, e helper p/ setar `Session.activeBusinessId`. Reutiliza as fixtures renomeadas da onda 1.
  (bloqueia os testes de US1–US5)
- [X] T014 [US6] Teste de **backfill** `tests/integration/multitenancy/backfill.test.ts` (verificação
  **pós-migração** — não é RED-first, valida o resultado de T011): pós-M2, o business demo tem slug;
  bookings/lançamentos/serviços seguem com o **mesmo** `businessId` (contagens idênticas); owner atual
  tem `BusinessMember`; operador é ADMIN. (SC-005)

**Checkpoint**: fundação funcional e fixtures multi-business prontas.

---

## Phase 4: User Story 1 — ADMIN cria negócio e promove dono (Priority: P1) 🎯

**Goal**: ADMIN cria negócio (slug validado) e promove dono por email, auditável; sem self-service.

**Independent Test**: como ADMIN, criar negócio com slug único e promover um usuário por email;
verificar auditoria e que não-ADMIN é recusado.

### Tests (test-first — RED antes) ⚠️

- [X] T015 [P] [US1] `tests/integration/multitenancy/admin.test.ts` (deve FALHAR): `requireAdmin` nega
  CLIENT e OWNER, admite ADMIN; `createBusinessForAdmin` cria com autor/momento; `promoteOwnerForAdmin`
  cria `BusinessMember` auditado, recusa email inexistente (`user_not_found`) e vínculo duplicado
  (`already_member`). (SC-003/FR-005..009)
- [X] T016 [P] [US1] `tests/integration/multitenancy/slug.test.ts` (deve FALHAR): slug fora do regex
  `^[a-z0-9]+(-[a-z0-9]+)*$` → `invalid_slug`; duplicado → `slug_taken`; reservado (admin/api/b/booking/
  owner/login/my-bookings/my-spending — via `RESERVED_SLUGS`) → `slug_reserved`; válido → criado.
  (SC-007/FR-023)
- [X] T017 [P] [US1] `tests/integration/multitenancy/anti-escalation.test.ts` (deve FALHAR): CLIENT
  chama `createBusiness`/`promoteOwner` (actions) → `ForbiddenError`; **não existe** action/símbolo p/
  promover a ADMIN (verificar por ausência); nenhuma action pública escreve `User.role`.
  (SC-003/SC-004/FR-006)

### Implementation

- [X] T018 [US1] `src/server/auth/admin.ts`: `requireAdmin()` (getCurrentUser → UnauthorizedError;
  `User.role` do banco → ForbiddenError se != ADMIN). (FR-004, D6)
- [X] T019 [US1] `src/server/business/admin-create-business.ts`: valida slug (regex + reservados +
  unicidade) → cria Business com `createdBy`/`createdAt`; reasons `invalid_slug|slug_reserved|
  slug_taken`. A lista de reservados é a **constante única** `RESERVED_SLUGS` exportada de
  `src/server/business/reserved-slugs.ts` (8 itens: admin, api, b, booking, owner, login, my-bookings,
  my-spending) — importada também por T016 e T011. Helper `slugify(name)` (kebab-case, sem acentos)
  para o pré-preenchimento. (FR-007/FR-023)
- [X] T020 [US1] `src/server/business/admin-promote-owner.ts`: busca usuário por **email exato** →
  cria `BusinessMember(OWNER, createdBy=adminId)`; reasons `business_not_found|user_not_found|
  already_member`. **Só promove a OWNER** (sem parâmetro de role). (FR-008/FR-009)
- [X] T021 [US1] Server Actions `src/server/actions/admin-create-business.ts` e
  `admin-promote-owner.ts`: `requireAdmin()`, validam entrada (whitelist), delegam com `adminId`.
  Nenhuma escreve `User.role`. (FR-005, D6)
- [X] T022 [US1] Rodar `admin.test.ts`/`slug.test.ts`/`anti-escalation.test.ts` até **verde**.
- [X] T023 [US1] UI `src/app/admin/page.tsx` (`requireAdmin`, redirect padrão) + ilhas em
  `src/components/admin/*`: form criar negócio (**slug pré-preenchido do nome, editável**), listar
  negócios, promover dono por email. Mensagens pt-BR por reason (sem reason órfão). (US1, FR-005..009)

**Checkpoint**: administração funcional e blindada.

---

## Phase 5: User Story 3 — Escopo por negócio / anti-IDOR (Priority: P1) 🎯 núcleo de segurança

**Goal**: toda operação de dono é escopada pelo negócio ativo do vínculo; A jamais lê/escreve B.

**Independent Test**: com 2 negócios/2 donos, tentar (como dono de A) operar B → recusado; caixa/
serviços de A não mostram B.

### Tests (test-first — RED antes) ⚠️

- [ ] T024 [P] [US3] `tests/integration/multitenancy/guards.test.ts` (deve FALHAR): `requireOwner`
  admite membro OWNER do negócio ativo e **recusa não-membro**; deriva `businessId` do vínculo (não de
  input). **Inclui o caso de segurança da camada 5**: um usuário `Role=ADMIN` **sem membership** →
  `requireOwner` **recusa** (ADMIN não opera negócios de terceiros: 0 acesso a caixa/ledger/painel).
  (SC-002/FR-010/FR-013/FR-014/FR-015)
- [ ] T025 [P] [US3] `tests/integration/multitenancy/isolation.test.ts` (deve FALHAR — **lógica
  crítica**): booking de A no **mesmo horário** de B **não** conflita (exclusion por business);
  `getCashSummaryForOwner`/`listLedgerForOwner` de A **não** somam/listam `LedgerEntry` de B; serviços
  de A não listam os de B. (SC-001/SC-008/FR-015/FR-016)

### Implementation

- [ ] T026 [US3] `src/server/business/active-business.ts`: `getActiveBusiness(userId)` → `active`
  (1 negócio auto; N com `Session.activeBusinessId` válido) / `needs_selection` / `empty`; **revalida
  membership por request**. (FR-018, D5, US2/US3)
- [ ] T027 [US3] Redefinir `src/server/auth/owner.ts`: `requireOwner()` = sessão + `getActiveBusiness`
  + confirma membro OWNER; retorna `{ user, businessId, timeZone }`. Remove `assertOwnerRole` (lia
  `User.role`). (FR-013, D9)
- [ ] T028 [US3] Re-origem do `businessId` nas **actions de dono**: trocar `getOwnerBarbershopId()` /
  `business.findFirstOrThrow()` por `requireOwner()` em `create-service`, `list-services-for-owner`,
  `set-opening-hours`, `list-opening-hours-for-owner`, `close-day`, `list-ledger`, e nas pages
  `owner/finance/page.tsx`/`owner/ledger/page.tsx`; `register-expense`/`register-walk-in` recebem
  `businessId` da action. **Remover** `src/server/owner/barbershop.ts` (`getOwnerBarbershopId`).
  (FR-014/FR-017, SC-002)
- [ ] T029 [US3] Rodar `guards.test.ts`/`isolation.test.ts` até **verde**; confirmar 0% de derivação
  do input. (SC-001/SC-002)

**Checkpoint**: isolamento por negócio provado (não-vazamento A×B).

---

## Phase 6: User Story 2 — Seletor de negócio ativo (Priority: P2)

**Goal**: dono com N negócios troca o ativo; 1 → auto/oculto; 0 → estado vazio.

### Tests (test-first) ⚠️

- [ ] T030 [P] [US2] `tests/integration/multitenancy/switch-business.test.ts` (deve FALHAR): membro
  troca ok (grava `Session.activeBusinessId`); **não-membro** do alvo → `not_member` (não grava);
  `getActiveBusiness`: 1→`active`, 0→`empty`, N>1 sem escolha→`needs_selection`. (SC-010/FR-018)

### Implementation

- [ ] T031 [US2] `src/server/business/switch-business.ts` (core) + action `src/server/actions/
  switch-business.ts`: valida membership do alvo → `prisma.session.update({ where:{sessionToken},
  data:{activeBusinessId} })`; lê `sessionToken` do cookie. (FR-018, D5)
- [ ] T032 [US2] Rodar `switch-business.test.ts` até **verde**.
- [ ] T033 [US2] UI `src/components/owner/business-switcher.tsx` (ilha): lista os negócios do vínculo,
  troca via `switchBusiness` + `router.refresh()`; **oculto** se 1; **estado vazio** (orientar contato
  com ADMIN) se 0. Integrar nas áreas de dono. (US2, FR-018)

**Checkpoint**: multi-negócio navegável, sem vazamento entre negócios ativos.

---

## Phase 7: User Story 4 — Página pública por slug (Priority: P2)

**Goal**: `/b/[slug]` mostra serviços do negócio e agenda nele; slug inválido → 404.

### Tests (test-first) ⚠️

- [ ] T034 [P] [US4] `tests/integration/multitenancy/public-slug.test.ts` (deve FALHAR):
  `listServicesForBusiness(businessId)` retorna só serviços ativos **daquele** negócio; agendar no
  contexto do negócio cria booking com o `businessId` do slug; slugs de A e B isolam serviços.
  Além disso: `/services` e `/booking` **globais** não expõem serviço de nenhum negócio (removida/
  redirect — R2). (FR-019/FR-020/SC-007)

### Implementation

- [ ] T035 [US4] `src/server/actions/list-services.ts` → `listServicesForBusiness(businessId)`
  (where `{ businessId, isActive }`), substituindo a leitura global. (FR-019)
- [ ] T036 [US4] `src/app/b/[slug]/page.tsx`: resolve business por `slug` (`findUnique`), `notFound()`
  se inexistente; lista serviços do negócio e entra no fluxo de agendamento **no contexto do negócio**
  (o serviço carrega o `businessId`). Lista vazia tratada. (FR-019/FR-020, US4)
- [ ] T036a [US4] **Destino das rotas globais (R2 — anti-vazamento)**: `/booking` global
  (`src/app/booking/page.tsx`) → **redirect permanente para `/`** (agendar só existe em `/b/[slug]`);
  **remover** `/services` global (`src/app/services/page.tsx`) e a action global `listServices()`
  (`src/server/actions/list-services.ts` — substituída por `listServicesForBusiness` no T035); o
  catálogo é por negócio, exibido no próprio `/b/[slug]`. Atualizar links internos (nav/botões) que
  apontavam para `/booking`/`/services`. (FR-019, US4, R2)
- [ ] T037 [US4] Rodar `public-slug.test.ts` até **verde**; validar `notFound()` para slug inexistente.

**Checkpoint**: porta de entrada do cliente por negócio.

---

## Phase 8: User Story 5 — Cliente global com rótulo de negócio (Priority: P3)

**Goal**: `/my-bookings` e `/my-spending` agregam todos os negócios, rotulando cada item.

### Tests (test-first) ⚠️

- [ ] T038 [P] [US5] `tests/integration/multitenancy/client-global.test.ts` (deve FALHAR): cliente com
  itens em 2 negócios vê os dois em `client-history` (e bookings), cada item com `business.name`;
  conta única (sem filtro por negócio). (SC-009/FR-021)

### Implementation

- [ ] T039 [US5] Incluir `business: { name }` no `select`/DTO de `src/server/ledger/client-history.ts`
  (e na listagem de bookings do cliente); UI de `src/app/my-spending/**` e `src/app/my-bookings/**`
  exibe o **nome do negócio** por item. Sem mudança de filtro (cliente global). (FR-021, US5)
- [ ] T040 [US5] Rodar `client-global.test.ts` até **verde**.

**Checkpoint**: cliente único enxerga tudo, rotulado.

---

## Phase 9: Navegação (cross-cutting — gap do mapa)

- [ ] T041 Ajustar `src/server/auth/session.ts` (`getNavSession`) e `src/components/site-header.tsx`:
  `isOwner` deixa de ler `User.role` e passa a consultar **membership** (≥1 vínculo OWNER via
  `BusinessMember`); adicionar link da área **/admin** visível **só** para `User.role === ADMIN`.
  Visibilidade é conveniência; a barreira é `requireOwner`/`requireAdmin`. (FR-013/FR-004, US1/US3)

---

## Phase 10: Polish & Cross-Cutting

- [ ] T042 [P] README: documentar multi-tenancy (negócio/serviço/membership), **bootstrap do 1º ADMIN**,
  regras de slug (regex/reservados/imutável), seletor de negócio ativo e `/b/[slug]`. (FR-020/FR-023,
  Princípio V)
- [ ] T043 Regressão final: `npm test` (**139 + novos** verdes; 001–006 intactas) e `npx tsc --noEmit`
  limpo; `git diff` confirma que a onda 1 foi só rename e que nenhum caminho público escreve
  `User.role`/`BusinessMember`. (FR-025/SC-004/SC-006)
- [ ] T044 Smoke manual (roteiro do `quickstart.md`): como ADMIN criar 2 negócios e promover donos;
  dono com 2 negócios **trocando** e vendo **caixas separados**; cliente agendando em `/b/slug-a` e
  `/b/slug-b` com a **mesma conta**; `/my-spending` rotulando os dois; tentativas de **acesso cruzado**
  (dono de A → B; CLIENT → /admin) **falhando**. (SC-001..SC-010)

---

## Dependencies & Execution Order

### Fases

- **Setup (P1)** → **ONDA 1 (P2)**: rename mecânico; termina no **GATE T009 (139 verdes)** —
  **bloqueia toda a onda 2**.
- **ONDA 2 Fundação (P3, US6)**: migration 2 + backfill + fixtures — bloqueia US1–US5.
- **US1 (P4)** e **US3 (P5)**: P1; dependem da fundação. US3 é o **núcleo de segurança** (isolamento).
- **US2 (P6)**: depende de US3 (`getActiveBusiness`/`requireOwner`).
- **US4 (P7)**, **US5 (P8)**: dependem da fundação; independentes entre si.
- **NAV (P9)**: depende de membership (US3) e ADMIN (US1).
- **Polish (P10)**: depois das histórias.

### Regra dura

**Nenhuma task T010+ começa antes do GATE T009.** A onda 1 é um bissector: qualquer vermelho ali é
erro de rename, não de lógica.

### Within each story

- Testes (test-first) escritos e **FALHANDO** antes da implementação.
- Guard/core antes da action; action antes da UI.

### Parallel Opportunities

- ONDA 1: T007 (pages/componentes) e T008 (fixtures) [P] após T006 (cores) — arquivos diferentes.
- US1: testes T015/T016/T017 [P]; US3: T024/T025 [P]; US2/US4/US5: os testes [P].
- US4 e US5 podem ser desenvolvidas em paralelo por pessoas diferentes (arquivos disjuntos), ambas
  após a fundação.

---

## Implementation Strategy

### MVP (fecha a segunda parceria)

1. Setup + **ONDA 1** (rename) → **GATE 139 verdes**.
2. **ONDA 2 Fundação** (migration 2 + backfill).
3. **US1** (ADMIN cria/promove) + **US3** (escopo/anti-IDOR) + **US4** (`/b/[slug]`).
4. **PARAR e VALIDAR**: ADMIN cria 2º negócio, promove dono, dono opera só o seu, cliente agenda no
   slug. Isso já **destrava a segunda parceria**.

### Incremental

ONDA 1 → (gate) → Fundação → US1 → US3 → US4 → US2 (seletor) → US5 (rótulo) → NAV → Polish. Cada etapa
testável; a regressão dos 139 roda no gate e no polish.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- **Cores da F005/F006 (deactivate-ledger-entry, complete-booking, register-*, cash-summary,
  ledger-list, client-history)**: só **rename** (onda 1) + re-origem do `businessId` na action (onda
  2); **nenhuma** mudança de lógica interna.
- Verificar testes **falhando** antes de implementar cada core da onda 2.
- Commit da onda 1 é único e fecha no gate; commits da onda 2 por task/grupo (escopo `(007)`, ASCII).
- Parar em qualquer checkpoint para validar isoladamente.
