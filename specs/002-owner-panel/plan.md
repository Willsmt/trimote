# Implementation Plan: Painel do Dono — Gerenciar Serviços e Horários

**Branch**: `002-owner-panel` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-owner-panel/spec.md`

## Summary

Dar ao dono um painel autenticado para gerenciar o catálogo de serviços (criar/editar/desativar) e o
horário de funcionamento, sem quebrar agendamentos existentes. Reaproveita integralmente a stack e a
fundação da 001 (Next.js 16/App Router, Prisma, NextAuth Google, ShadCN, Postgres em Docker `:5433`,
camada de tempo Luxon). A autorização usa um campo `role` (`CLIENT | OWNER`) no `User`, verificado no
servidor por um guard único `requireOwner` reusado por todas as Server Actions de gestão e pela página
do painel. A integridade é garantida no banco (default de `role`, índice único parcial de nome entre
serviços ativos, soft delete via `isActive`). Bookings existentes já estão protegidos por design: o
`endsAt` é materializado na reserva (001) e a disponibilidade é domínio puro — mudanças de catálogo/
expediente afetam apenas o futuro.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (Next.js 16, App Router) — mesma da 001.

**Primary Dependencies**: Next.js 16, React 19, Prisma, NextAuth/Auth.js (Google), ShadCN UI + Tailwind,
Luxon, Vitest. **Nenhuma dependência nova** prevista.

**Storage**: PostgreSQL (Docker `:5433`). Novas migrations: enum `Role` + `User.role`, `BarbershopService.isActive`, índice único parcial de nome.

**Testing**: Vitest. Test-first (Princípio IV) para o guard `requireOwner` (não-dono barrado no
servidor) e para a regra de soft-delete/preservação de booking. Integração contra Postgres para as
constraints (índice parcial, default de role).

**Target Platform**: Aplicação web (Server Actions em Node.js) — mesma da 001.

**Project Type**: Web app full-stack Next.js (projeto único).

**Performance Goals**: Baixo volume (uma barbearia, um dono). Meta de UX: criar/editar serviço em
< 1 min (SC-006).

**Constraints**: Autorização verificada no servidor (FR-001, Princípio I). Integridade no banco
(Princípio II): default de role, unicidade de nome entre ativos, impossibilidade de delete físico de
serviço em uso. Não recalcular `endsAt` retroativamente; não cancelar bookings por mudança de
catálogo/expediente.

**Scale/Scope**: 1 barbearia, 1 dono, catálogo pequeno. Reuso máximo da 001.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aderência | Status |
|-----------|-----------|--------|
| I. Segurança (Blue Team) | Autorização por `role` verificada **no servidor** em toda ação de gestão via `requireOwner`; UI nunca é a única barreira. Sem novos segredos. | ✅ PASS |
| II. Integridade no Banco | `role` com default no banco; **índice único parcial** (nome entre `isActive=true`); soft delete impede delete físico de serviço em uso — tudo no nível de dados, não só na app. | ✅ PASS |
| III. SOLID / Clean Code | Guard único reusado (DRY); core de gestão testável separado das Server Actions (padrão da 001); domínio de disponibilidade da 001 reusado sem cópia. | ✅ PASS |
| IV. Test-First | Testes falhando antes de implementar o guard de autorização e a regra de soft-delete/preservação de booking. | ✅ PASS |
| V. Convenções | Conventional Commits; objetos/código em inglês, docs/comentários em português; README atualizado com o painel e a promoção a OWNER. | ✅ PASS |
| VI. Escopo Disciplinado | Único ajuste em código da 001: filtro `isActive` na listagem pública (`listServices`). Nada mais da 001 é tocado. | ✅ PASS |
| VII. Tempo (UTC/SP) | Reusa a camada de tempo e o domínio de disponibilidade da 001; nenhuma nova lógica temporal. | ✅ PASS |

**Resultado do gate**: PASS — sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/002-owner-panel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── owner-actions.md
└── tasks.md            # (/speckit-tasks — não criado aqui)
```

### Source Code (repository root) — adições/ajustes

```text
prisma/
├── schema.prisma                 # + enum Role; User.role; BarbershopService.isActive
├── migrations/                   # + migration: role/isActive; + SQL manual do índice único parcial
└── seed.ts                       # + promoção de um usuário a OWNER (script/seed)

src/
├── app/
│   └── owner/                    # Painel do dono (guarda requireOwner)
│       ├── page.tsx              # entrada do painel (dashboard)
│       ├── services/page.tsx     # gerenciar serviços (US1)
│       └── opening-hours/page.tsx# gerenciar expediente (US2)
├── components/owner/             # UI client do painel (forms/listas)
├── server/
│   ├── auth/
│   │   └── owner.ts              # requireOwner (guard único de role no servidor)
│   ├── actions/                  # createService, updateService, deactivateService,
│   │   │                         # setOpeningHours, closeDay (Server Actions de gestão)
│   │   └── list-services.ts      # AJUSTE 001: filtrar isActive=true (único toque na 001)
│   └── owner/                    # core testável: services.ts, opening-hours.ts
└── ...

tests/
├── unit/                         # (se aplicável) validações puras de input
└── integration/
    ├── owner-authorization/      # guard: não-dono barrado no servidor (test-first)
    └── service-lifecycle/        # soft-delete + preservação de booking + unicidade parcial
```

**Structure Decision**: Mantém a arquitetura da 001 — Server Actions finas em `src/server/actions/`
sobre um **core testável** em `src/server/owner/`, com o guard `requireOwner` em `src/server/auth/`.
O painel vive em `src/app/owner/`. Reuso direto do domínio de disponibilidade e da camada de tempo da
001 (nenhuma cópia). O único arquivo da 001 alterado é `src/server/actions/list-services.ts` (filtro
`isActive`), justificado pelo FR-006.

## Complexity Tracking

> Nenhuma violação a justificar. O índice único parcial via SQL manual e o soft delete são
> complexidade **essencial** ao Princípio II (integridade no banco), não acidental.
