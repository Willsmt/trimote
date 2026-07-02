# Implementation Plan: Financeiro — Balancete e Histórico

**Branch**: `006-financial-reports` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-financial-reports/spec.md`

## Summary

Transformar os lançamentos capturados na F005 em informação, **sem nenhum caminho de escrita novo**.
O OWNER vê o **caixa** por período (entradas, saídas, saldo — US1) com **breakdown** por forma de
pagamento e por categoria (US2), e navega o **razão** paginado por cursor com filtros combináveis
(US3); cada linha ativa oferece **inativar** reutilizando o soft delete da F005 (US4). O CLIENT vê o
**histórico dos próprios gastos** (US5). Feature de **LEITURA PURA**: zero migração, zero entidade
nova, zero mudança no core da F005.

Abordagem técnica (decisões fechadas do usuário):

- **Agregações (US1/US2)** por `prisma.$queryRaw` **tipado** (não Prisma `groupBy`): o `groupBy` não
  expressa `SUM(...) FILTER (WHERE type=...)`, baldes de `null` nem `COALESCE(SUM,0)` numa passada.
  Os **limites do período** `[startUtc, endUtc)` são derivados uma vez **na aplicação** (Luxon, via a
  fronteira única `src/domain/time`) a partir de `Barbershop.timezone` (**parametrizado**, nunca
  hardcode); o WHERE compara `occurredAt` a esses **escalares UTC** (range), preservando o índice
  `(barbershopId, occurredAt)` da F005 — **nunca** função sobre `occurredAt` no WHERE.
  `AT TIME ZONE`/`date_trunc` no banco ficam como **alternativa rejeitada** (dispensados p/ período
  único — Clarify FR-003, research D3). `COALESCE(SUM(amount),0)` cobre período vazio. `Prisma.Decimal`,
  nunca float.
- **Listagem (US3) e histórico (US5)** por `prisma.findMany` normal (sem SQL cru) com **keyset**
  composto `(occurredAt, id)` desc, `take = pageSize + 1` para `hasMore` sem `COUNT`.
- **Autorização**: caixa/breakdown/razão/inativação exigem `requireOwner` (F002); histórico do
  CLIENT exige apenas sessão autenticada e filtra `clientId = sessão` **no servidor** (o id nunca vem
  do input — disciplina da F004).
- **Reuso**: a inativação a partir da listagem chama a **mesma** Server Action `deactivateLedgerEntry`
  e o core `deactivate-ledger-entry.ts` da F005, **sem nenhuma mudança**.

Reaproveita a fundação: `requireOwner`/`requireUser` (F002/F004), a fronteira de fuso `src/domain/
time` (Luxon) para exibição e navegação de período, o padrão **core testável + Server Action fina +
Server Component** (F003/F004/F005), e `Barbershop.timezone` como fonte do fuso (a mesma que o
domínio de disponibilidade da F001 já lê em `create-booking.ts`/`reschedule-booking.ts`/
`get-available-slots.ts`).

### Inspeção prévia (itens 18 e 19 — confirmados)

- **Item 18 — como a F001 lê `Barbershop.timezone`**: `create-booking.ts:66`,
  `reschedule-booking.ts:109` e `get-available-slots.ts:29` fazem
  `const timeZone = service.barbershop.timezone;` e delegam TODA conversão a `src/domain/time`
  (Luxon: `localDateTimeToUtc`, `utcToLocalMinutes`, `weekdayInZone`, `todayInZone`). Padrão a
  seguir: **ler o campo `timezone` da barbearia e passar como parâmetro**; nunca hardcode. Para as
  **agregações** da F006 esse mesmo valor vai ao `$queryRaw` como parâmetro `$tz` (novo uso: fuso no
  banco, justificado no Constitution Check).
- **Item 19 — shape de `deactivateLedgerEntry`**: `src/server/actions/deactivate-ledger-entry.ts`
  expõe `deactivateLedgerEntry(input: { ledgerEntryId: string }): Promise<DeactivateLedgerEntryResult>`,
  chama `requireOwner()` e delega ao core `deactivateLedgerEntryForOwner`. O core aceita **qualquer**
  `ledgerEntryId` (ordem `entry_not_found → already_inactive → update`). **Conclusão: reutilizável a
  partir de qualquer linha da listagem sem alteração de assinatura nem de reasons.** A limitação
  "inativar só o último" da F005 era **de UI** (a home do ledger só expunha o último), não do core.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20+ (Next.js 16, App Router) — mesma da 001–005.

**Primary Dependencies**: Next.js 16, React 19, Prisma 6, NextAuth (Google), ShadCN UI + Tailwind,
Luxon, Vitest. **Nenhuma dependência nova.**

**Storage**: PostgreSQL (Docker `:5433`). **Nenhuma migration** — leitura pura sobre o schema da
F005. Aproveita o índice existente `@@index([barbershopId, occurredAt])`.

**Testing**: Vitest. Test-first para os cores de leitura (agregação/listagem/histórico), integração
contra Postgres real, com fixtures em datas/fusos conhecidos. Casos obrigatórios: borda de fuso 22h/
23h local vs. dia UTC seguinte (SC-003), inativo fora de tudo (SC-002), soma do breakdown = total
(SC-004), keyset com `occurredAt` empatado (SC-006), histórico do cliente não vaza (SC-010/SC-011).

**Target Platform**: Aplicação web full-stack Next.js — mesma da 001–005.

**Project Type**: Web app full-stack Next.js (projeto único).

**Performance Goals**: Baixo volume (uma barbearia). Sem metas de throughput. Objetivo é usar o
índice nas agregações e paginar por keyset (sem `OFFSET`/`COUNT`).

**Constraints**: Autorização por **role OWNER** no servidor (`requireOwner`) para
caixa/breakdown/razão/inativação; **sessão + filtro server-side** para o histórico do cliente.
Dinheiro em `Prisma.Decimal` (nunca float); serialização Decimal→string na fronteira Server/Client.
Fuso da barbearia (`Barbershop.timezone`) parametrizado, nunca hardcoded nem string interpolada em
SQL. Índice `(barbershopId, occurredAt)` preservado (range no WHERE, nunca função sobre a coluna).

**Scale/Scope**: 5 histórias (US1–US5), 3 cores de leitura novos, 2 Server Actions de leitura novas
(razão + histórico), reuso de 1 action de escrita (soft delete), páginas/ilhas de UI do OWNER e do
CLIENT. Sem gráficos/export/comparativos/edição/gateway (FR-026).

## Constitution Check

*GATE: verificado antes da Phase 0 e reavaliado após a Phase 1 design.*

- **I. Segurança Primeiro (Blue Team)** — ✅ PASS. Autorização no servidor: `requireOwner` para o
  OWNER (FR-022), sessão + filtro `clientId = sessão` para o CLIENT, com o id **sempre** da sessão,
  **nunca** do input (FR-021). Toda entrada de filtro/cursor é validada no servidor (whitelist de
  campos de filtro; cursor parseado e validado). `$tz` e todos os valores do `$queryRaw` são
  **parâmetros** (`Prisma.sql`/placeholder), sem interpolação de string → sem superfície de SQL
  injection. Sem vazamento de dados de outros clientes.
- **II. Integridade no Banco** — ✅ PASS (N/A para escrita). Feature de leitura; nenhuma constraint/
  unicidade nova. A única mutação (soft delete) já é coberta pela F005 e é reutilizada intacta.
- **III. Qualidade de Código (SOLID/Clean)** — ✅ PASS. Cores puros e pequenos por história
  (`cash-summary.ts`, `ledger-list.ts`, `client-history.ts`), Server Actions finas, Server
  Components de leitura, ilhas client mínimas. Sem duplicar o core da F005.
- **IV. Test-First na Lógica de Domínio** — ✅ PASS. A lógica crítica aqui é **bucketização por
  fuso** e **keyset estável**; ambos têm teste-primeiro (RED antes) por integração contra Postgres
  (bordas de fuso, empate de `occurredAt`, inativo excluído, soma=total, histórico não-vaza). A
  não-sobreposição de agenda não é tocada.
- **V. Commits/Idioma/Documentação** — ✅ PASS. Conventional Commits; código/identificadores em
  inglês, comentários/documentação em português; README atualizado com a visão de balancete/histórico
  ao final.
- **VI. Escopo Disciplinado** — ✅ PASS. Somente leitura; **nenhum** arquivo de core da F005 é
  alterado (item 13/14). Se o design concluir que algo precisa mudar no soft delete da F005, o plano
  manda **PARAR e reportar** (não mudar). A migração do botão "Inativar" para a linha e a
  simplificação do banner "último lançamento" são de **superfície** (UI), não de core.
- **VII. Tempo — UTC no armazenamento, fuso da barbearia na lógica** — ✅ PASS. Armazenamento em UTC
  (inalterado). **Toda** conversão de fuso ocorre na fronteira única `src/domain/time` (Luxon):
  exibição, navegação de período e derivação dos limites `[startUtc, endUtc)` a partir de
  `Barbershop.timezone` (explícito, parametrizado). As agregações filtram por **range UTC** sobre
  `occurredAt` (sem `AT TIME ZONE`/`date_trunc` na query — Clarify FR-003); portanto **não há**
  conversão de fuso no banco nem desvio do Princípio VII, e nenhuma dependência do fuso do servidor.

**Resultado do gate**: PASS (nenhuma violação não-justificada). Reavaliado pós-design: PASS
(artefatos não introduzem entidade, migração nem escrita).

## Project Structure

### Documentation (this feature)

```text
specs/006-financial-reports/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Phase 0 — decisões técnicas e reconciliação
├── data-model.md        # Phase 1 — entidades reusadas + DTOs de leitura (sem migração)
├── quickstart.md        # Phase 1 — roteiro de validação (SC-001..SC-012)
├── contracts/           # Phase 1 — contratos dos cores/actions de leitura
│   ├── cash-summary.md
│   ├── ledger-list.md
│   └── client-history.md
├── checklists/
│   └── requirements.md  # (já criado no /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── time/
│       └── index.ts                  # + helpers de limites de período (dia/semana/mês/ano) no fuso
│                                     #   → [startUtc, endUtc); + navegação prev/next (Luxon)
├── server/
│   └── ledger/
│       ├── cash-summary.ts           # NOVO core (US1/US2): $queryRaw tipado, totais + breakdown
│       ├── ledger-list.ts            # NOVO core (US3): keyset findMany + filtros combináveis
│       ├── client-history.ts         # NOVO core (US5): receitas do clientId (= sessão), keyset
│       ├── deactivate-ledger-entry.ts# REUSO F005 — INALTERADO
│       ├── register-expense.ts       # F005 — INALTERADO
│       ├── register-walk-in.ts       # F005 — INALTERADO
│       ├── complete-booking.ts       # F005 — INALTERADO
│       └── ledger-items.ts           # F005 — INALTERADO
├── server/
│   └── actions/
│       ├── list-ledger.ts            # NOVO action fina (US3): requireOwner → ledger-list core
│       ├── list-my-ledger.ts         # NOVO action fina (US5): requireUser → client-history core
│       └── deactivate-ledger-entry.ts# REUSO F005 — INALTERADO
└── app/
    ├── owner/
    │   └── finance/                  # NOVO segmento do OWNER (balancete): caixa + breakdown + razão
    │       └── page.tsx              #   Server Component (abre no mês corrente; período via searchParams)
    ├── my-spending/                  # NOVO segmento do CLIENT (histórico dos próprios gastos)
    │   └── page.tsx                  #   Server Component (sessão) + ilha "carregar mais"
    └── owner/ledger/page.tsx         # F005 — banner "último lançamento" simplificado (superfície)

src/components/
├── owner/
│   ├── cash-summary-view.tsx         # NOVO (server-friendly) — números do caixa + breakdown
│   ├── ledger-browser.tsx            # NOVA ilha client — filtros + carregar mais + inativar por linha
│   └── ledger-manager.tsx            # F005 — "Inativar" migra p/ a listagem; banner simplificado
└── client/
    └── my-spending-list.tsx          # NOVA ilha client — carregar mais do histórico

tests/
├── integration/ledger/
│   ├── cash-summary.test.ts          # NOVO — totais, breakdown, fuso, inativo, soma=total, vazio
│   ├── ledger-list.test.ts           # NOVO — keyset estável, filtros, inativos sob filtro
│   ├── client-history.test.ts        # NOVO — só receitas do cliente, não-vaza, inativo fora
│   └── fixtures.ts                    # F005 — estendida com helpers de seed de lançamentos por data
└── unit/time/
    └── period-bounds.test.ts         # NOVO (opcional) — limites de período no fuso (Luxon)
```

**Structure Decision**: Projeto único Next.js (mesma estrutura das features 001–005). Os cores de
leitura vivem em `src/server/ledger/` ao lado dos cores da F005 (sem tocá-los), com o padrão
consolidado **core testável (ownerId/userId + params explícitos) → Server Action fina → Server
Component + ilha client mínima**. Os limites de período (fuso → UTC, navegação) entram na fronteira
única `src/domain/time` (Princípio VII), reutilizando Luxon. As agregações são o único ponto com SQL
cru (`$queryRaw` tipado, parametrizado), justificado no Constitution Check e no `research.md`.

## Complexity Tracking

> Preenchido para justificar o único desvio de padrão do projeto: SQL cru (`$queryRaw`) onde o resto
> usa Prisma Client. **Não há** desvio do Princípio VII — o fuso é convertido só na fronteira
> `src/domain/time` e a query filtra por range UTC (ver Constitution Check VII).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SQL cru (`$queryRaw`) num projeto que usa Prisma Client em todo o resto | Necessário para `SUM(...) FILTER (WHERE type=...)`, `GROUP BY paymentMethod/category` com balde `null`, e `COALESCE(SUM,0)` para período vazio — em uma passada, tipado como `Decimal`. | Múltiplas chamadas `aggregate` + montagem em JS seriam mais código, mais round-trips e ainda sem os baldes de `null`. O `$queryRaw` é **tipado** e **parametrizado** (sem interpolação), restrito ao caminho de agregação (US1/US2); listagem/histórico seguem `findMany` normal. |
