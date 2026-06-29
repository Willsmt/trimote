# Implementation Plan: Agendamento Online de Barbearia (MVP)

**Branch**: `001-barber-booking` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-barber-booking/spec.md`

## Summary

Permitir que um cliente autenticado agende um serviço da barbearia por conta própria, vendo apenas
horários realmente livres e garantindo que **nunca** haja duplo agendamento. A abordagem técnica usa
Next.js 16 (App Router, TypeScript) com Server Actions, PostgreSQL via Prisma, e NextAuth (Google
OAuth) para identificar o dono do agendamento. A regra crítica de não-sobreposição é garantida **no
nível de dados** por uma PostgreSQL exclusion constraint (`EXCLUDE USING gist` sobre `tstzrange`,
extensão `btree_gist`), aplicada via migration SQL manual e restrita a agendamentos ativos. O cálculo
de disponibilidade é lógica de domínio pura (sem I/O), desenvolvida test-first, operando em
`America/Sao_Paulo` com armazenamento em UTC.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (Next.js 16, App Router)

**Primary Dependencies**: Next.js 16, React 19, Prisma (ORM), NextAuth/Auth.js (Google OAuth provider),
ShadCN UI (Radix) + Tailwind CSS. **Luxon** para data/fuso (API de timezone IANA de primeira classe),
usado exclusivamente dentro da camada `src/domain/time/` — ver research.md (D4).

**Storage**: PostgreSQL (Docker / docker-compose no ambiente local). Connection string via
`DATABASE_URL` no `.env`. Extensão `btree_gist` habilitada por migration.

**Testing**: **Vitest** para unidade da lógica de domínio (disponibilidade) e camada de tempo —
rodando **sem banco**; testes de integração contra Postgres real para validar a exclusion constraint e
a tradução do erro de conflito sob concorrência. Test-first obrigatório para domínio (Princípio IV).
Ver research.md (D7).

**Target Platform**: Aplicação web (server-side rendering / Server Actions em Node.js); navegadores
modernos no cliente.

**Project Type**: Web application (Next.js full-stack — frontend + lógica de servidor no mesmo projeto).

**Performance Goals**: MVP de baixo volume (uma barbearia, um recurso). Meta de UX: fluxo de
agendamento completável em < 2 min (SC-006); respostas de disponibilidade percebidas como instantâneas.

**Constraints**: Todos os instantes em UTC (timestamptz); toda lógica temporal em `America/Sao_Paulo`
(Princípio VII / FR-014). Segredos apenas via variáveis de ambiente (Princípio I). Não-sobreposição
garantida no banco, não só na aplicação (Princípio II / FR-008, FR-009).

**Scale/Scope**: 1 barbearia, 1 recurso/cadeira, catálogo pequeno de serviços, baixa concorrência —
mas a correção sob concorrência é requisito rígido mesmo em baixo volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Avaliação contra a Constituição do Trimote v1.0.0:

| Princípio | Aderência do plano | Status |
|-----------|--------------------|--------|
| I. Segurança Primeiro (Blue Team) | `DATABASE_URL`, Google `CLIENT_ID/SECRET`, `NEXTAUTH_SECRET` só via `.env` (no `.gitignore`); `.env.example` versionado sem segredos. Toda entrada validada no servidor (Server Actions); validação de cliente é só UX. Logs sem dados sensíveis. | ✅ PASS |
| II. Integridade no Banco | Não-sobreposição e unicidade garantidas por exclusion constraint + constraints `UNIQUE`/FK no Postgres, dentro de transação. Não depende apenas da aplicação. | ✅ PASS |
| III. SOLID / Clean Code | Lógica de disponibilidade isolada como módulo puro; conversão de fuso centralizada numa camada única; tratamento de erro explícito (violação de constraint → recusa). | ✅ PASS |
| IV. Test-First na Lógica de Domínio | Testes falhando antes da implementação para disponibilidade (bordas) e para o caminho de conflito (violação da exclusion constraint). | ✅ PASS |
| V. Convenções | Conventional Commits; objetos de banco e código em inglês; comentários e docs em português; README atualizado com setup Docker + variáveis de ambiente. | ✅ PASS |
| VI. Escopo Disciplinado | Apenas o MVP da spec; fora de escopo (multi-barbearia, múltiplas cadeiras, painel do dono, pagamentos, avaliações, notificações) explicitamente excluído. | ✅ PASS |
| VII. Tempo (UTC armazena, SP calcula) | `timestamptz` em UTC; cálculo de disponibilidade/conflito/passado em `America/Sao_Paulo`; conversão explícita, nunca dependente do fuso do servidor. | ✅ PASS |

**Resultado do gate**: PASS — nenhuma violação. Nenhuma entrada em Complexity Tracking necessária.

## Project Structure

### Documentation (this feature)

```text
specs/001-barber-booking/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── server-actions.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                 # Models: User, Account, Session, Barbershop, OpeningHours,
│                                 #         BarbershopService, Booking
├── migrations/                   # Inclui migration SQL MANUAL com btree_gist + exclusion constraint
└── seed.ts                       # Dados pré-cadastrados: barbershop, opening hours, services

src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Páginas de login (NextAuth)
│   ├── api/auth/[...nextauth]/   # NextAuth route handler
│   ├── services/                 # Listagem de serviços (US3)
│   ├── booking/                  # Escolha de dia/horário e confirmação (US1)
│   └── my-bookings/              # Lista e cancelamento dos próprios agendamentos (US2)
├── components/
│   └── ui/                       # ShadCN UI (Radix) + Tailwind
├── server/
│   ├── actions/                  # Server Actions: createBooking, cancelBooking, listMyBookings
│   ├── auth/                     # Configuração NextAuth + helpers de sessão/owner
│   └── db/                       # Prisma client (singleton)
├── domain/
│   ├── availability/             # Cálculo de slots livres — LÓGICA PURA, sem I/O (test-first)
│   └── time/                     # Camada única de conversão UTC <-> America/Sao_Paulo
└── lib/                          # Utilitários compartilhados

tests/
├── unit/
│   ├── availability/             # Bordas: não cabe antes do fechamento, dia sem expediente, passado
│   └── time/                     # Conversões de fuso
└── integration/
    └── booking-conflict/         # Exclusion constraint sob concorrência + tradução do erro Prisma

docker-compose.yml                # PostgreSQL local
.env.example                      # Variáveis necessárias, sem valores reais
```

**Structure Decision**: Aplicação web full-stack Next.js (App Router) em projeto único. A separação
explícita de `src/domain/` (lógica pura, test-first) de `src/server/` (I/O, Prisma, Server Actions) e
`src/app/` (UI) reflete o Princípio III (SOLID/Clean Code) e isola a lógica de disponibilidade para
permitir teste-primeiro sem dependência de banco (Princípio IV). A camada `src/domain/time/`
centraliza toda conversão de fuso (Princípio VII).

## Complexity Tracking

> Nenhuma violação da Constituição a justificar. Seção intencionalmente vazia.

A exclusion constraint via migration SQL manual **não** é uma violação: é a forma correta de cumprir o
Princípio II (integridade no banco), justamente porque o Prisma não expressa esse tipo de constraint
no `schema.prisma`. É complexidade essencial ao requisito, não acidental.
