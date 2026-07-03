# Implementation Plan: Multi-tenancy — Negócios, Donos e Administração

**Branch**: `007-multi-tenancy` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-multi-tenancy/spec.md`

## Summary

Transformar o Trimote de instalação única em **plataforma multi-tenant**: N negócios na mesma infra,
donos vinculados por **membership** (N:N), uma conta **ADMIN** que cria negócios e promove donos, e
página pública por **slug**. É a feature **mais invasiva** do projeto — toca os cores de F001–F006.
A **regressão dos 139 testes é critério de design**, não formalidade, e é o gate entre as duas
migrations.

Abordagem técnica (decisões fechadas do usuário):

- **Duas migrations separadas, em ordem**: (1) **rename puro** `Barbershop→Business`,
  `BarbershopService→Service`, `barbershopId→businessId` em todas as tabelas + coluna `segment`
  (default "barbershop"), **zero lógica**; SQL **editado à mão** (`--create-only`) para `ALTER TABLE
  RENAME` (preserva dados, índices e a **exclusion constraint**). (2) **funcional**: `Role += ADMIN`,
  model `BusinessMember` (N:N, `@@unique([userId, businessId])`), `Business.slug @unique`, e
  **backfill** no mesmo deploy (business existente ganha slug; OWNER atual ganha membership).
- **Gate obrigatório entre 1 e 2**: query em `pg_constraint` provando que `booking_no_overlap` existe
  e referencia `businessId`; **139 testes verdes** ANTES de iniciar a migration 2.
- **Anti-escalação (5 camadas)**: nenhuma Server Action pública escreve `User.role` nem cria
  `BusinessMember`; role/vínculo lidos do banco a cada request (`requireAdmin` novo, `requireOwner`
  passa a validar membership); ADMIN só promove a **OWNER** (não há "promover a ADMIN" — 2º admin é
  seed manual); `businessId` **nunca** vem do input em operação de dono (deriva do negócio ativo da
  sessão + revalidação de membership); ADMIN não opera negócios de terceiros.
- **Negócio ativo = estado de sessão no servidor** (`Session.activeBusinessId`), revalidado por
  request; 1 negócio → auto; 0 → estado vazio. **Slug** informado pelo ADMIN, pré-preenchido do nome,
  validado no servidor (regex + unicidade + reservados).
- **`OWNER` sai do `Role` global** como autoridade: a fonte de verdade da posse passa a ser
  `BusinessMember`; `requireOwner` consulta o vínculo (ver research D4 para o tratamento do valor de
  enum, que **permanece** por custo de migração).

### Inspeção prévia obrigatória (item 8 — mapa de "barbearia única")

Todos os pontos que hoje assumem uma barbearia, com o **destino** de cada um na F007:

| Ponto | Arquivo | Hoje | Destino F007 |
|---|---|---|---|
| Resolve "a barbearia" do dono | `src/server/owner/barbershop.ts` (`getOwnerBarbershopId`) | `barbershop.findFirstOrThrow` | **Substituído** por `getActiveBusiness()` (deriva do negócio ativo da sessão + revalida membership). |
| Caixa/razão do dono | `src/app/owner/finance/page.tsx`, `src/server/actions/list-ledger.ts` | `barbershop.findFirstOrThrow({timezone})` | Deriva `businessId`+`timezone` do **negócio ativo** (não `findFirst`). |
| Despesa / walk-in (barbershopId do shop único) | `src/server/ledger/register-expense.ts`, `register-walk-in.ts` | `barbershop.findFirstOrThrow` p/ o `barbershopId` | Recebe `businessId` do negócio ativo (via action). |
| Serviços / horários do dono | `create-service`, `list-services-for-owner`, `set-opening-hours`, `list-opening-hours-for-owner`, `close-day` (actions) | `getOwnerBarbershopId()` | `getActiveBusiness()` → `businessId`. Cores (`owner/services.ts`, `owner/opening-hours.ts`) **já** recebem `barbershopId` por parâmetro → só renomear p/ `businessId`. |
| Página do ledger (dono) | `src/app/owner/ledger/page.tsx` | `getOwnerBarbershopId()` | `getActiveBusiness()`. |
| Lista pública de serviços | `src/server/actions/list-services.ts`, `src/app/booking/page.tsx` | `service.findMany({isActive})` (sem escopo) | **Escopar por `businessId`** do slug (`/b/[slug]`). |
| Booking / reschedule / slots | `create-booking.ts`, `reschedule-booking.ts`, `get-available-slots.ts` | derivam `barbershopId` de `service.barbershopId` | **Sem mudança de lógica** além do rename; o negócio vem do serviço (que pertence ao business). Não-sobreposição segue **por business**. |
| Cores financeiros (agregação/keyset) | `cash-summary.ts`, `ledger-list.ts`, `complete-booking.ts` | recebem `barbershopId` por parâmetro | Renomear p/ `businessId`; continuam parametrizados (bom — a F006 já isolou por `barbershopId`). |
| Fixtures de teste | `tests/integration/**/fixtures.ts` + suites com `BARBERSHOP_ID`/`barbershop-trimote` | constante única | **Migration 1**: renomear refs (`prisma.service`, `businessId`) mantendo 1 business. **Migration 2**: fixtures criam membership do owner + um **2º business** para os testes de isolamento (ver research D8). |

### Fluxo do negócio ativo (item 9)

`Session.activeBusinessId` (FK nullable p/ `Business`, `onDelete: SetNull`). O switch de negócio é uma
Server Action que lê o `sessionToken` do cookie, valida que o usuário é **membro OWNER** do alvo e
grava `activeBusinessId` na row de `Session`. Toda operação de dono chama `getActiveBusiness()`, que:
resolve a sessão → lê `activeBusinessId` → **revalida membership** no banco → devolve o business, ou
aciona seleção (N>1 sem escolha) / auto (N=1) / estado vazio (N=0). É **server-side** e revalidado por
request (Clarify #2 / FR-014). Alternativa rejeitada (cookie httpOnly separado) em research D5.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20+ (Next.js 16, App Router) — mesma da 001–006.

**Primary Dependencies**: Next.js 16, React 19, Prisma 6, NextAuth (Google, **database sessions** via
PrismaAdapter), Luxon, Vitest. **Nenhuma dependência nova.**

**Storage**: PostgreSQL (Docker `:5433`). **Duas migrations**: (1) rename SQL hand-edited
(`ALTER TABLE RENAME`); (2) funcional (enum `ADMIN` aditivo, `BusinessMember`, `slug`, backfill). A
exclusion constraint `booking_no_overlap` NÃO é recriada — o rename preserva-a.

**Testing**: Vitest. **Test-first** para guards (`requireAdmin`, `requireOwner`-com-membership),
anti-escalação, slug (formato/unicidade/reservados), backfill íntegro, e isolamento por negócio
(booking de A não conflita com B; caixa de A não soma lançamento de B). **Regressão dos 139 é gate**
entre e depois das migrations.

**Target Platform**: Web app full-stack Next.js — mesma da 001–006.

**Project Type**: Web app full-stack Next.js (projeto único).

**Performance Goals**: Baixo volume por negócio; multi-tenant numa instância. Sem metas de throughput.
Índices existentes por `businessId` (renomeados) seguem servindo agregação/keyset.

**Constraints**: Anti-IDOR horizontal (businessId da sessão, revalidado) e vertical (sem self-service
de role); segredos por env; Decimal p/ dinheiro; UTC no armazenamento, fuso do **negócio** na lógica;
inglês no código/banco, português nos docs.

**Scale/Scope**: 6 histórias; 2 migrations; entidades novas (`BusinessMember`, `Business.slug/
segment`, `Session.activeBusinessId`, `Role.ADMIN`, enum `BusinessRole`); guards novos; áreas `/admin`
e `/b/[slug]`; seletor de negócio ativo; rótulo de negócio nas listagens do cliente. Toca todos os
cores anteriores (renomeados + escopados). Fora de escopo: STAFF, visual, marketplace, cobrança,
multi-vertical real, edição de slug.

## Constitution Check

*GATE: verificado antes da Phase 0 e reavaliado após a Phase 1.*

- **I. Segurança Primeiro (Blue Team)** — ✅ PASS (é o coração da feature). Anti-escalação em 5
  camadas (research D6): sem caminho público p/ elevar privilégio; role/membership lidos do **banco**
  por request; ADMIN só promove a OWNER; `businessId` nunca do input (deriva da sessão, revalidado);
  ADMIN não opera negócios de terceiros. Entrada validada no servidor (slug regex/reservados, email
  exato). Segredos por env (inalterado).
- **II. Integridade no Banco** — ✅ PASS. `@@unique([userId, businessId])` torna vínculo duplicado
  **impossível** no dado (não na app); `Business.slug @unique`; FKs com `onDelete` explícito. A
  **exclusion constraint** `booking_no_overlap` (não-sobreposição por negócio) é **preservada** pelo
  rename (Princípio II mantido; validado por `pg_constraint` — gate).
- **III. Qualidade de Código (SOLID/Clean)** — ✅ PASS. Rename mecânico isolado na migration 1;
  guards pequenos e coesos (`requireAdmin`, `getActiveBusiness`, `requireOwner`); cores continuam
  parametrizados por `businessId`. Relations nomeadas onde há 2 FKs p/ User (`BusinessMember.userId`
  vs `createdBy` — mesmo cuidado da F005).
- **IV. Test-First na Lógica de Domínio** — ✅ PASS. Test-first para os guards e o **isolamento por
  negócio** (a lógica crítica desta feature: não-vazamento entre tenants). A não-sobreposição por
  negócio ganha teste explícito pós-rename (booking de A × B).
- **V. Commits/Idioma/Documentação** — ✅ PASS. Conventional Commits escopo `(007)`, corpo ASCII;
  inglês no código/banco (Business, Service, BusinessMember, slug, segment), português nos docs;
  README atualizado; bootstrap do 1º ADMIN **documentado**.
- **VI. Escopo Disciplinado** — ✅ PASS. Rename é "zero lógica"; funcional adiciona só o necessário.
  STAFF fica **só como enum preparado** (nasce com OWNER); nada de visual/marketplace/cobrança/
  multi-vertical. A regressão total protege contra alteração acidental de comportamento anterior.
- **VII. Tempo — UTC no armazenamento, fuso da barbearia na lógica** — ✅ PASS. Fuso passa a ser o do
  **negócio** (`Business.timezone`, renomeado de `Barbershop.timezone`); a fronteira `src/domain/time`
  e o range-em-UTC da F006 seguem intactos, agora por negócio.

**Resultado do gate**: PASS. Reavaliado pós-design: PASS (as duas migrations mantêm as garantias de
banco; nenhuma viola um princípio — as complexidades são justificadas em Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/007-multi-tenancy/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   ├── admin.md              # criar Business, promover OWNER (auditado)
│   ├── active-business.md    # Session.activeBusinessId, getActiveBusiness, switch, requireOwner
│   ├── business-scoping.md   # cores/actions renomeados + escopados por businessId
│   └── public-slug.md        # /b/[slug], list-services por negócio, notFound()
├── checklists/requirements.md
└── tasks.md                  # (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                       # rename (M1) + BusinessMember/slug/segment/Role.ADMIN (M2)
└── migrations/
    ├── <ts>_rename_business/…          # M1: SQL HAND-EDITED (ALTER TABLE RENAME) — zero lógica
    └── <ts>_multitenancy/…             # M2: enum ADMIN, BusinessMember, slug + backfill

src/
├── server/
│   ├── auth/
│   │   ├── admin.ts                    # NOVO: requireAdmin (User.role === ADMIN, lido do banco)
│   │   └── owner.ts                    # requireOwner passa a validar BusinessMember do negócio ativo
│   ├── business/
│   │   ├── active-business.ts          # NOVO: getActiveBusiness() (sessão + revalida membership)
│   │   ├── switch-business.ts          # NOVO core: valida membership → grava Session.activeBusinessId
│   │   ├── admin-create-business.ts    # NOVO core: valida slug (regex/uniq/reservados) → cria Business
│   │   └── admin-promote-owner.ts      # NOVO core: email exato → cria BusinessMember auditado
│   ├── owner/{services,opening-hours}.ts   # renomear barbershopId→businessId (params já existem)
│   ├── ledger/*.ts, booking/*.ts       # rename barbershopId→businessId (M1); escopo via negócio ativo (M2)
│   └── actions/                        # actions do dono: getOwnerBarbershopId → getActiveBusiness; novas actions admin/switch
├── app/
│   ├── admin/page.tsx                  # NOVO: área ADMIN (requireAdmin) — criar negócio, listar, promover
│   ├── b/[slug]/page.tsx               # NOVO: página pública do negócio (notFound se slug inválido)
│   ├── owner/**                        # + seletor de negócio ativo; deriva do negócio ativo
│   └── my-bookings, my-spending        # + rótulo do negócio por item (US5)
└── components/
    ├── admin/*                         # ilhas: criar negócio (slug pré-preenchido), promover dono
    └── owner/business-switcher.tsx     # NOVO: seletor de negócio ativo (oculto se 1)

tests/integration/
├── multitenancy/                       # NOVO: guards, anti-escalação, slug, backfill, isolamento A×B
└── **/fixtures.ts                      # M1: rename refs; M2: membership do owner + 2º business fixture
```

**Structure Decision**: Projeto único Next.js. A F007 é sequenciada em **duas ondas** que espelham as
duas migrations: **onda 1 (rename)** é mecânica e termina com os 139 verdes; **onda 2 (funcional)**
adiciona guards, membership, `/admin`, `/b/[slug]`, seletor e o escopo por negócio, com testes novos
de isolamento e anti-escalação. Os cores financeiros/booking já eram parametrizados por `barbershopId`
(F006 isolou por barbearia), então o escopo por negócio é evolução natural, não reescrita.

## Complexity Tracking

> Complexidades inerentes à natureza multi-tenant + rename; cada uma justificada.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Rename com **SQL hand-edited** (fora do fluxo padrão do Prisma migrate) | O gerador do Prisma trata rename de model/coluna como **DROP + CREATE** → perderia dados e a exclusion constraint. `ALTER TABLE RENAME` preserva tudo. | Deixar o Prisma gerar o rename destrói dados em dev/prod e recria a constraint (risco). O SQL manual é a única forma segura (item 1). |
| **Duas** migrations em vez de uma | Separar rename (zero lógica, verificável por 139 verdes) da mudança funcional isola o risco e dá um ponto de regressão limpo. | Uma migration única misturaria rename destrutivo-se-mal-feito com lógica nova — impossível bissectar a causa de uma regressão. |
| `Session.activeBusinessId` (escrita fora do PrismaAdapter do NextAuth) | O negócio ativo precisa ser **estado server-side revalidado** (anti-IDOR). Coluna nullable na Session é o mais server-side (o client só guarda o sessionToken opaco). | Cookie httpOnly separado é client-transportável (mesmo httpOnly) — aceitável só com revalidação, mas menos fiel a "estado de sessão no servidor" (research D5). Parâmetro de request = IDOR (proibido). |
| `OWNER` permanece no enum `Role` mas **deixa de ser autoridade** | Remover valor de enum no Postgres exige recriar o tipo (op arriscada) — desproporcional. Semanticamente OWNER sai (a posse vive em `BusinessMember`); fisicamente o valor fica sem uso. | Remover fisicamente o valor agora arrisca a migração mais crítica do projeto sem ganho funcional; remoção fica como cleanup futuro (research D4). |
