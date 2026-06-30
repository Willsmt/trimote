# Implementation Plan: Remarcar Agendamento

**Branch**: `004-reschedule-booking` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-reschedule-booking/spec.md`

## Summary

Permitir que o cliente dono **mova** um agendamento ativo e futuro para um novo horário e/ou troque o
serviço, mantendo a **mesma identidade** (UPDATE da linha, não cancela-e-recria). Reaproveita
integralmente a fundação 001/002: domínio de disponibilidade puro (`computeAvailableSlots`), a
**exclusion constraint** `booking_no_overlap` (não-sobreposição garantida no banco), o padrão de
ownership (`requireUser` + verificação no servidor) e a camada de tempo Luxon (UTC no armazenamento,
`America/Sao_Paulo` na lógica). A remarcação é um `UPDATE` da mesma `Booking` (serviceId, startsAt,
endsAt) dentro de `prisma.$transaction`, com `endsAt` recalculado pela duração do serviço escolhido; a
violação `23P01` é traduzida em `slot_unavailable` (igual ao `createBooking`). O horário antigo é
liberado **automaticamente** (disponibilidade é derivada dos bookings ativos). A recusa de
"mesmo horário e serviço" (FR-012, decidida em clarify) é uma **checagem de aplicação** (`no_change`),
não a constraint. **Sem migration** (UPDATE de colunas existentes).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (Next.js 16, App Router) — mesma da 001/002.

**Primary Dependencies**: Next.js 16, React 19, Prisma, NextAuth (Google), ShadCN UI + Tailwind, Luxon,
Vitest. **Nenhuma dependência nova.**

**Storage**: PostgreSQL (Docker `:5433`). **Nenhuma migration** — reusa a tabela `Booking`, a exclusion
constraint parcial em `status='ACTIVE'` e o catálogo de serviços. Remarcar = `UPDATE` de
`serviceId/startsAt/endsAt` na mesma linha.

**Testing**: Vitest. Test-first (Princípio IV) na lógica crítica de domínio/conflito: disponibilidade
excluindo o próprio booking, conflito sob concorrência (`23P01 → slot_unavailable`), recusa de
`no_change`, e recusas de ownership/elegibilidade (`not_owner`/`not_active`/`booking_in_past`/
`in_the_past`). Integração contra Postgres para a exclusion constraint e o exclude-self.

**Target Platform**: Aplicação web full-stack Next.js — mesma da 001/002.

**Project Type**: Web app full-stack Next.js (projeto único).

**Performance Goals**: Baixo volume (uma barbearia). Meta de UX: remarcação simples em < 1 min (SC-008).

**Constraints**: Não-sobreposição garantida no banco (Princípio II) — a aplicação só **traduz** a
violação. Ownership/elegibilidade verificadas no servidor (Princípio I, FR-007/FR-008/FR-010). Tempo em
`America/Sao_Paulo` (Princípio VII). Sem janela de antecedência (FR-011). Mover é atômico em transação
(FR-001/FR-003).

**Scale/Scope**: 1 barbearia, poucos clientes. Reuso máximo da 001/002.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aderência | Status |
|-----------|-----------|--------|
| I. Segurança (Blue Team) | Ownership e elegibilidade (ACTIVE + futuro) verificadas **no servidor** (`requireUser` + checagem no core); cliente nunca remarca booking alheio. Sem novos segredos. | ✅ PASS |
| II. Integridade no Banco | A não-sobreposição continua sendo a **exclusion constraint** `booking_no_overlap`; o UPDATE roda em `$transaction` e a violação `23P01` vira `slot_unavailable`. A app não reimplementa a garantia. | ✅ PASS |
| III. SOLID / Clean Code | Core testável (`reschedule-booking.ts`) separado da Server Action fina; reuso do domínio puro **sem cópia**; exclude-self resolvido no ponto mais limpo (query), sem poluir a função pura. | ✅ PASS |
| IV. Test-First | Testes falhando antes de implementar: exclude-self, conflito concorrente, `no_change`, ownership/elegibilidade. | ✅ PASS |
| V. Convenções | Conventional Commits; identificadores em inglês, comentários/docs em português; README atualizado com a remarcação. | ✅ PASS |
| VI. Escopo Disciplinado | Único toque na 001: parâmetro **opcional** `excludeBookingId` em `getAvailableSlots` (query). `computeAvailableSlots` e `createBooking`/`cancelBooking` ficam intactos. Nada de notificação/antecedência/pagamento/OWNER. | ✅ PASS |
| VII. Tempo (UTC/SP) | Reusa `src/domain/time` e a revalidação de expediente; nenhuma nova lógica temporal. | ✅ PASS |

**Resultado do gate**: PASS — sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/004-reschedule-booking/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── reschedule-booking.md     # contrato da Server Action + reasons
└── tasks.md                      # (/speckit-tasks — não criado aqui)
```

### Source Code (repository root) — adições/ajustes

```text
src/
├── app/
│   └── my-bookings/
│       └── [id]/reschedule/page.tsx   # NOVO: carrega booking (guard/ownership) + serviços, renderiza o flow
├── components/
│   ├── my-bookings-list.tsx           # AJUSTE: ação "Remarcar" nos agendamentos ATIVOS e FUTUROS
│   └── reschedule-flow.tsx            # NOVO (client): escolher serviço/dia/horário e confirmar
├── server/
│   ├── booking/
│   │   └── reschedule-booking.ts      # NOVO core testável (ownership, elegibilidade, no_change, UPDATE atômico)
│   └── actions/
│       ├── reschedule-booking.ts      # NOVO Server Action fina (requireUser → core)
│       └── get-available-slots.ts     # AJUSTE 001 (ÚNICO): + excludeBookingId opcional (id != no WHERE)
tests/
└── integration/
    └── reschedule/                    # test-first: move+libera, conflito 23P01, no_change, ownership/elegibilidade, exclude-self
```

**Structure Decision**: Mantém a arquitetura 001/002 — **core testável** em `src/server/booking/`
(`reschedule-booking.ts`) sob uma **Server Action fina** em `src/server/actions/` que deriva o owner via
`requireUser`. A UI parte de "Meus agendamentos" (página + flow client, espelhando `booking/page.tsx` +
`booking-flow.tsx`). O **único** arquivo da 001 alterado é `src/server/actions/get-available-slots.ts`
(parâmetro opcional `excludeBookingId`); o domínio puro `computeAvailableSlots` e os cores
`createBooking`/`cancelBooking` **não** são tocados.

## Complexity Tracking

> Nenhuma violação a justificar. A atomicidade via `$transaction` + exclusion constraint é complexidade
> **essencial** ao Princípio II (já existente na 001), não acidental. O exclude-self foi posicionado na
> query (em vez de na função pura) justamente para minimizar o toque e manter o domínio limpo.
