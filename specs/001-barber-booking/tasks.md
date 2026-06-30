---

description: "Task list for feature 001-barber-booking"
---

# Tasks: Agendamento Online de Barbearia (MVP)

**Input**: Design documents from `specs/001-barber-booking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Incluídos **apenas** onde a Constituição do Trimote (Princípio IV) os torna obrigatórios —
lógica de disponibilidade e caminho de conflito de agendamento (exclusion constraint sob concorrência).
Esses testes são **test-first**: devem ser escritos e falhar antes da implementação.

**Organization**: Tarefas agrupadas por user story para implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1, US2, US3 (mapeia para as user stories da spec.md)
- Caminho de arquivo exato incluído em cada tarefa

## Path Conventions

Web app full-stack Next.js (App Router) em projeto único, conforme `plan.md`:
`prisma/`, `src/app/`, `src/server/`, `src/domain/`, `src/components/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialização do projeto e estrutura base.

- [ ] T001 Inicializar projeto Next.js 16 (App Router, TypeScript) com a estrutura de diretórios do plano em `src/app/`, `src/server/`, `src/domain/`, `src/components/`, `prisma/`, `tests/`
- [ ] T002 [P] Instalar dependências: `prisma`/`@prisma/client`, `next-auth`, `luxon` (+ `@types/luxon`), ShadCN UI (Radix) + Tailwind CSS em `package.json`
- [ ] T003 [P] Criar `docker-compose.yml` na raiz com serviço PostgreSQL para ambiente local
- [ ] T004 [P] Criar `.env.example` na raiz com `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (sem valores reais) e confirmar `.env` no `.gitignore` (Princípio I)
- [ ] T005 [P] Configurar lint/format (ESLint + Prettier) e Conventional Commits (ex.: commitlint) na raiz
- [ ] T006 Configurar Vitest com dois modos em `vitest.config.ts`: unidade (`src/domain/`, sem banco) e integração (contra Postgres do docker-compose)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura central exigida por todas as user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase.

- [ ] T007 Definir o schema Prisma em `prisma/schema.prisma`: modelos `User`, `Account`, `Session` (adapter NextAuth), `Barbershop`, `OpeningHours`, `BarbershopService`, `Booking` e enum `BookingStatus { ACTIVE, CANCELLED }`, com preço como `Decimal`/NUMERIC e `Booking` contendo `startsAt`, `endsAt` (ambos timestamptz UTC), `status`, FKs (ver data-model.md)
- [ ] T008 [P] Criar o Prisma Client singleton em `src/server/db/client.ts`
- [ ] T009 Gerar a migration inicial com `prisma migrate dev --create-only` (ainda sem a exclusion constraint) em `prisma/migrations/`
- [ ] T010 Editar a migration gerada para adicionar, em SQL manual, `CREATE EXTENSION IF NOT EXISTS btree_gist;` e a exclusion constraint `booking_no_overlap`: `EXCLUDE USING gist ("barbershopId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (status = 'ACTIVE')` — intervalo semiaberto `'[)'` (adjacência válida) e parcial em `ACTIVE` (research.md D1/D8); adicionar também `CHECK ("endsAt" > "startsAt")` na mesma migration
- [ ] T011 [P] Configurar NextAuth (Auth.js) com provider Google OAuth em `src/server/auth/options.ts` e o route handler em `src/app/api/auth/[...nextauth]/route.ts` (segredos só via env — Princípio I)
- [ ] T012 Escrever testes (test-first, devem FALHAR) da camada de tempo em `tests/unit/time/time.test.ts`: conversões UTC ↔ `America/Sao_Paulo`, sem dependência do fuso do servidor (Princípio VII)
- [ ] T013 Implementar a camada de tempo única com Luxon em `src/domain/time/index.ts` (única fronteira de conversão de fuso) até os testes de T012 passarem
- [ ] T014 [P] Criar `src/server/auth/session.ts` com helper que obtém o usuário autenticado da sessão no servidor (owner) e rejeita ausência de sessão (FR-001)
- [ ] T015 Criar o seed em `prisma/seed.ts`: 1 `Barbershop`, suas `OpeningHours` por weekday e um conjunto de `BarbershopService` (nome, preço, duração)

**Checkpoint**: Fundação pronta — schema + exclusion constraint aplicados, auth e camada de tempo prontos, dados semeados.

---

## Phase 3: User Story 1 - Agendar um serviço (Priority: P1) 🎯 MVP

**Goal**: Cliente autenticado vê horários realmente livres de um dia e confirma um agendamento, sem
nunca permitir duplo agendamento.

**Independent Test**: Autenticar, escolher serviço e dia, ver slots livres, confirmar; o agendamento
passa a existir e aquele horário some dos livres; duas confirmações simultâneas do mesmo intervalo →
apenas uma sucede.

### Tests for User Story 1 (test-first — Princípio IV) ⚠️

> Escrever PRIMEIRO e garantir que FALHAM antes de implementar.

- [ ] T016 [P] [US1] Testes de unidade do cálculo de disponibilidade em `tests/unit/availability/availability.test.ts`: slot não cabe antes do fechamento (FR-004/FR-005), dia sem expediente (sem slots), slot no passado (FR-006), colisão com booking ativo, e adjacência válida `'[)'` (fim 10:00 + início 10:00 não conflita)
- [ ] T017 [P] [US1] Teste de integração de conflito em `tests/integration/booking-conflict/conflict.test.ts`: duas criações concorrentes do mesmo intervalo contra Postgres real → exatamente uma sucede; a violação da exclusion constraint (SQLSTATE `23P01`, não `P2002`) é traduzida em recusa `slot_unavailable` (FR-008/FR-009/FR-015, research.md D2)

### Implementation for User Story 1

- [ ] T018 [US1] Implementar a função pura de disponibilidade em `src/domain/availability/index.ts` (recebe opening hours + bookings ativos + duração + `slotStepMinutes` default 30 + `now`; sem I/O) até T016 passar (depende de T013)
- [ ] T019 [US1] Implementar a Server Action `getAvailableSlots` em `src/server/actions/get-available-slots.ts` (carrega opening hours e bookings ativos, chama o domínio, retorna slots em ISO/UTC) — contrato em contracts/server-actions.md
- [ ] T020 [US1] Implementar a Server Action `createBooking` em `src/server/actions/create-booking.ts`: valida sessão (owner) e entrada no servidor, calcula `endsAt = startsAt + durationMinutes` e insere o `Booking` (incluindo `barbershopId`, chave de partição da exclusion constraint) com `status = ACTIVE` dentro de `prisma.$transaction`; captura a violação da exclusion constraint e retorna `slot_unavailable` (FR-007/FR-015) até T017 passar — a lógica fica no core testável `src/server/booking/create-booking.ts` (`createBookingForUser({ userId })`); a Server Action `src/server/actions/create-booking.ts` é um wrapper que deriva o owner via `requireUser`
- [ ] T021 [US1] Construir a UI de agendamento em `src/app/booking/page.tsx` (+ componentes em `src/components/`): selecionar serviço, escolher dia, listar slots livres e confirmar
- [ ] T022 [US1] Aplicar guarda de autenticação no fluxo de booking (`src/app/booking/`) redirecionando/recusando visitante não autenticado (FR-001)

**Checkpoint**: US1 funcional e testável de forma independente — agendar com garantia de não-sobreposição no nível de dados.

---

## Phase 4: User Story 2 - Ver e cancelar os próprios agendamentos (Priority: P2)

**Goal**: Cliente autenticado vê apenas os próprios agendamentos e cancela qualquer um, liberando o horário.

**Independent Test**: Criar um agendamento, listá-lo, cancelá-lo e verificar que o horário reaparece
como livre; outro cliente não consegue ver nem cancelar agendamento alheio.

### Tests for User Story 2 (test-first — Princípio IV) ⚠️

- [ ] T023 [P] [US2] Teste de integração de ownership e liberação em `tests/integration/booking-ownership/ownership.test.ts`: cliente não acessa/cancela booking de outro (FR-012); cancelar muda status para `CANCELLED` e o intervalo volta a ficar livre (FR-013)

### Implementation for User Story 2

- [ ] T024 [US2] Implementar `listBookingsForUser` (core, filtra por `userId`) em `src/server/booking/list-my-bookings.ts` e a Server Action `listMyBookings` (wrapper `requireUser`) em `src/server/actions/list-my-bookings.ts` (FR-010/FR-012)
- [ ] T025 [US2] Implementar `cancelBookingForUser` (core: verifica ownership, soft delete `status = CANCELLED`, `cancelledAt = now`, liberando o intervalo via constraint parcial) em `src/server/booking/cancel-booking.ts` e a Server Action `cancelBooking` (wrapper `requireUser`) em `src/server/actions/cancel-booking.ts` (FR-011/FR-013) até T023 passar
- [ ] T026 [US2] Construir a UI em `src/app/my-bookings/page.tsx`: listar os próprios agendamentos e cancelar

**Checkpoint**: US1 e US2 funcionam independentemente.

---

## Phase 5: User Story 3 - Descobrir os serviços oferecidos (Priority: P3)

**Goal**: Visitante/cliente vê os serviços com nome, preço e duração.

**Independent Test**: Consultar a lista de serviços e ver nome, preço e duração de cada um.

### Implementation for User Story 3

- [ ] T027 [US3] Implementar a Server Action `listServices` em `src/server/actions/list-services.ts` retornando `{ id, name, price, durationMinutes }` (FR-002)
- [ ] T028 [US3] Construir a UI em `src/app/services/page.tsx` exibindo nome, preço e duração de cada serviço

**Checkpoint**: Todas as user stories independentemente funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Acabamento e preocupações transversais.

- [ ] T029 [P] Atualizar o `README.md` com setup do Docker, migrations (incl. exclusion constraint), seed e variáveis de ambiente (Princípio V)
- [ ] T030 [P] Revisar todas as Server Actions garantindo tratamento de erro explícito e logs sem dados sensíveis (Princípios I e III)
- [ ] T031 Executar os cenários de validação do `quickstart.md` de ponta a ponta e confirmar a presença da constraint `booking_no_overlap` no banco
- [ ] T032 [P] Cobertura adicional de unidade para bordas remanescentes de disponibilidade/tempo em `tests/unit/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — **BLOQUEIA** todas as user stories
- **User Stories (Phase 3+)**: dependem da Foundational; depois podem seguir em paralelo ou na ordem P1 → P2 → P3
- **Polish (Phase 6)**: depende das user stories desejadas concluídas

### User Story Dependencies

- **US1 (P1)**: começa após a Foundational — sem dependência de outras stories
- **US2 (P2)**: começa após a Foundational — usa bookings criados por US1 mas é testável de forma independente (pode criar via seed/fixture)
- **US3 (P3)**: começa após a Foundational — independente (lê serviços do seed)

### Within Each User Story

- Testes obrigatórios (disponibilidade, conflito, ownership) escritos e **falhando** antes da implementação
- Domínio puro antes das Server Actions; Server Actions antes da UI
- História completa antes de passar à próxima prioridade

### Parallel Opportunities

- Setup: T002, T003, T004, T005 em paralelo
- Foundational: T008, T011, T014 em paralelo; T012 (testes de tempo) em paralelo com eles
- US1: T016 e T017 em paralelo (testes); depois implementação
- Polish: T029, T030, T032 em paralelo

---

## Parallel Example: User Story 1

```bash
# Testes da US1 juntos (test-first, devem falhar):
Task: "Testes de disponibilidade em tests/unit/availability/availability.test.ts"   # T016
Task: "Teste de conflito/concorrência em tests/integration/booking-conflict/conflict.test.ts"  # T017
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational (CRÍTICA — inclui a exclusion constraint e a camada de tempo)
3. Phase 3: User Story 1
4. **PARAR e VALIDAR**: testar US1 isoladamente (incl. concorrência)
5. Deploy/demo se pronto

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → testar → demo (MVP!)
3. US2 → testar → demo
4. US3 → testar → demo

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente
- Testes obrigatórios apenas onde o Princípio IV exige (disponibilidade, conflito, ownership); demais áreas sem teste no MVP
- Verificar que os testes falham antes de implementar
- Commit por tarefa ou grupo lógico, em Conventional Commits (Princípio V)
- Objetos de banco e código em inglês; comentários e docs em português (Princípio V)
- Padrão: Server Actions (`src/server/actions/`) são wrappers finos sobre um core em `src/server/booking/` testável por `userId` (SOLID/testabilidade — Princípio III)
