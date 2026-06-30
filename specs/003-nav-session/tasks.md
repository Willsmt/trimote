---
description: "Task list — 003-nav-session (Navegação e Sessão)"
---

# Tasks: Navegação e Sessão

**Input**: Design documents from `specs/003-nav-session/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/nav-contract.md, quickstart.md

**Tests**: NÃO solicitados. A feature é UI + leitura de sessão; não há lógica de domínio
(disponibilidade/conflito) nova. O SC-005 já está coberto pelo lockdown da 002. Nenhum teste de
renderização supérfluo (Princípios IV/VI). Validação por `quickstart.md`.

**Organization**: tarefas agrupadas por user story para implementação/validação independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: a qual user story a tarefa pertence (US1/US2/US3)
- Caminhos de arquivo são absolutos a partir da raiz do repositório

## Path Conventions

Projeto único Next.js (App Router). Código em `src/`; navegação em `src/components/`; camada de
auth em `src/server/auth/`. Sem migrations (reusa `User.role` da 002 e as tabelas de sessão do
NextAuth).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar pré-condições — nenhuma dependência nova é necessária.

- [x] T001 Confirmar que `next-auth/react` (`signIn`/`signOut`) está disponível e que **nenhuma**
  dependência nova precisa ser adicionada; confirmar (research.md D3) que **não** é necessário
  `SessionProvider`, pois a sessão é lida no servidor. Verificar em `package.json` que `next-auth`
  já é dependência.

**Checkpoint**: stack confirmada — sem novas deps, sem migrations.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: leitura de sessão+papel no servidor, da qual ambas as stories de navegação dependem.

**⚠️ CRITICAL**: nenhuma story de navegação pode renderizar links antes desta fase.

- [x] T002 Adicionar `getNavSession()` em `src/server/auth/session.ts`: reusa `getCurrentUser()`;
  se houver usuário, lê o `role` no banco (`prisma.user.findUnique({ where: { id }, select: { role } })`)
  — **mesma fonte de verdade do `requireOwner`** — e retorna `{ user, role }`; sem sessão retorna
  `{ user: null, role: null }`. Apenas leitura para exibição (NÃO decide autorização). Papel
  ausente/não reconhecido é tratado como menor privilégio pelo consumidor (data-model.md, FR-009).

**Checkpoint**: `getNavSession()` disponível — header pode ser construído.

---

## Phase 3: User Story 1 - Entrar e sair pela navegação (Priority: P1) 🎯 MVP

**Goal**: visitante inicia o login pela navegação (sem digitar URL) e usuário autenticado consegue
sair; a navegação indica a sessão ativa e quem está logado.

**Independent Test**: abrir `/` como visitante e ver "Entrar"; autenticar com Google; ao voltar ver
a indicação de sessão (nome/email) e "Sair"; clicar "Sair" e voltar à condição de visitante
(quickstart C1, C2, C5).

### Implementation for User Story 1

- [x] T003 [P] [US1] Criar `src/components/auth-buttons.tsx` (`"use client"`) com os gatilhos:
  botão "Entrar" → `signIn("google")` e botão "Sair" → `signOut()` (de `next-auth/react`). Único
  componente client da feature (research.md D3, FR-001/FR-002).
- [x] T004 [US1] Criar `src/components/site-header.tsx` (Server Component `async`): chama
  `getNavSession()`; sempre exibe o link "Serviços" (`/services`); se **não** houver sessão exibe o
  botão "Entrar" (de `auth-buttons.tsx`); se houver sessão exibe a indicação de sessão
  (`user.name ?? user.email`) e o botão "Sair" (FR-001/FR-002/FR-007). Links por papel ficam para a
  US2.
- [x] T005 [US1] Montar `<SiteHeader />` em `src/app/layout.tsx`, antes de `{children}` dentro do
  `<body>`, para aparecer em todas as páginas (FR-008). Depende de T004.

**Checkpoint**: login/logout pela navegação funcionando; indicação de sessão correta. MVP entregue.

---

## Phase 4: User Story 2 - Navegação conforme o papel (Priority: P2)

**Goal**: a navegação exibe os links a que o usuário tem direito conforme o papel (visitante /
CLIENT / OWNER), com o "Painel" só para OWNER.

**Independent Test**: como CLIENT ver "Agendar"/"Meus agendamentos" e **não** ver "Painel"; como
OWNER ver adicionalmente "Painel"; como visitante não ver link de área logada (quickstart C2, C3;
contracts/nav-contract.md).

### Implementation for User Story 2

- [x] T006 [US2] Estender `src/components/site-header.tsx` para renderizar os links por papel
  conforme a matriz de `contracts/nav-contract.md`: CLIENT vê "Agendar" (`/booking`) e "Meus
  agendamentos" (`/my-bookings`); OWNER vê tudo do CLIENT mais "Painel" (`/owner`); papel não
  reconhecido → menor privilégio (nunca exibe "Painel"). Usa o `role` já fornecido por
  `getNavSession()` (FR-004/FR-005/FR-006/FR-009). Modifica o mesmo arquivo de T004 (sequencial).

**Checkpoint**: US1 e US2 funcionando; links corretos por papel.

---

## Phase 5: User Story 3 - Visibilidade não enfraquece a proteção do servidor (Priority: P3)

**Goal**: garantir que esconder "Painel" é só conveniência — a barreira real do servidor permanece e
barra um CLIENT que acesse `/owner` diretamente.

**Independent Test**: como CLIENT (com "Painel" oculto), navegar para `/owner` e confirmar o redirect
para `/` (quickstart C4, SC-005).

### Implementation for User Story 3

- [ ] T007 [US3] **Verificação, sem alteração de código**: confirmar que `src/server/auth/owner.ts`
  e as páginas `src/app/owner/*` não foram tocados por esta feature (apenas `layout.tsx`,
  `session.ts` e os dois componentes novos mudaram). Executar o cenário C4 do `quickstart.md`: CLIENT
  acessando `/owner` direto é redirecionado para `/` (lockdown da 002 inalterado, FR-010/FR-011,
  SC-005).

**Checkpoint**: navegação por papel não enfraquece nenhuma proteção existente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: documentação e validação final.

- [ ] T008 [P] Atualizar o `README.md` com a navegação (header, login/logout, links por papel),
  conforme Princípio V.
- [ ] T009 Rodar a validação completa do `quickstart.md` (C1–C8) e confirmar que `npm run test`
  segue verde (nenhuma garantia da 001/002 foi alterada).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente.
- **Foundational (Phase 2)**: depende do Setup. **BLOQUEIA** as stories de navegação (T004/T006 usam
  `getNavSession`).
- **US1 (Phase 3)**: depende da Foundational. Entrega o MVP.
- **US2 (Phase 4)**: depende da Foundational; estende o header criado na US1 (T006 depende de T004).
- **US3 (Phase 5)**: verificação; pode rodar assim que a navegação por papel (US2) existir.
- **Polish (Phase 6)**: depois das stories desejadas.

### User Story Dependencies

- **US1 (P1)**: após Foundational. Independente.
- **US2 (P2)**: após Foundational. Estende o arquivo `site-header.tsx` da US1 — por isso T006 é
  sequencial a T004 (mesmo arquivo), não paralela.
- **US3 (P3)**: verificação do não-enfraquecimento; depende de US2 estar visível para testar a
  ocultação do "Painel", mas o redirect já existe independentemente (lockdown da 002).

### Within Each User Story

- T004 (criar header) antes de T005 (montar no layout) e antes de T006 (estender header).
- T002 (foundational) antes de qualquer consumo de `getNavSession`.

### Parallel Opportunities

- T003 (`auth-buttons.tsx`) é `[P]`: arquivo novo independente, pode ser criado em paralelo a T004.
- T008 (README) é `[P]`: independente do código.
- O restante é majoritariamente sequencial por convergir no único arquivo `site-header.tsx`.

---

## Parallel Example: User Story 1

```bash
# auth-buttons (client) pode ser criado em paralelo ao header:
Task: "Criar src/components/auth-buttons.tsx (signIn/signOut)"
# enquanto o header é montado (depende de getNavSession já pronto na Foundational):
Task: "Criar src/components/site-header.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational: `getNavSession`).
2. Phase 3 (US1): auth-buttons + header (Entrar/Sair + indicação de sessão) + montar no layout.
3. **PARAR e VALIDAR**: login/logout pela navegação (quickstart C1, C2, C5).

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → testar → MVP (entrar/sair visíveis).
3. US2 → testar → links por papel.
4. US3 → verificar não-regressão (SC-005).
5. Polish → README + quickstart completo.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- Nenhuma migration; reusa `User.role` (002) e as sessões do NextAuth.
- **Não tocar** `src/server/auth/owner.ts` nem `src/app/owner/*` (US3/Princípio VI).
- A decisão de quais links mostrar é sempre no servidor (FR-009/FR-010); a barreira real é o
  `requireOwner` (FR-011).
- Commit por tarefa ou grupo lógico, seguindo Conventional Commits (Princípio V).
