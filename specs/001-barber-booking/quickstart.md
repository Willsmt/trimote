# Phase 1 — Quickstart / Validation Guide

Guia para subir o ambiente e validar de ponta a ponta a feature 001-barber-booking. Não contém código
de implementação — referencia [data-model.md](./data-model.md) e [contracts/server-actions.md](./contracts/server-actions.md).

## Pré-requisitos

- Node.js 20+ e gerenciador de pacotes (pnpm/npm).
- Docker + Docker Compose (PostgreSQL local).
- Credenciais Google OAuth (Client ID/Secret) para login.

## Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher (Princípio I — `.env` nunca é commitado):

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trimote
NEXTAUTH_SECRET=<gerar>
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<do Google Cloud>
GOOGLE_CLIENT_SECRET=<do Google Cloud>
```

## Setup

```bash
docker compose up -d          # sobe o PostgreSQL
pnpm install
pnpm prisma migrate deploy    # aplica migrations, incluindo btree_gist + exclusion constraint
pnpm prisma db seed           # cria barbershop, opening hours e services
pnpm dev                      # inicia o app em http://localhost:3000
```

> A migration da exclusion constraint é **SQL manual** (ver data-model.md). Após `migrate deploy`,
> confirme que a constraint existe (seção de validação abaixo).

## Testes (Princípio IV — test-first)

```bash
pnpm test:unit          # disponibilidade (bordas) + camada de tempo
pnpm test:integration   # conflito/concorrência contra Postgres real
```

## Cenários de validação (mapeados aos critérios de aceite)

1. **Listar serviços (US3 / SC-)**: acessar a página de serviços ⇒ cada serviço mostra nome, preço e
   duração.
2. **Disponibilidade respeita expediente (FR-004/FR-005, SC-002)**: escolher um serviço e um dia ⇒
   nenhum horário aparece fora de `[opensAt, closesAt)`, e nenhum cujo fim ultrapasse `closesAt`.
3. **Sem passado (FR-006, SC-005)**: para o dia de hoje, horários já passados (referência
   America/Sao_Paulo) não aparecem nem são aceitos.
4. **Criar agendamento (US1)**: confirmar um horário livre ⇒ agendamento criado e some da lista de
   livres.
5. **Não-sobreposição sob concorrência (FR-008/FR-009, SC-001)**: disparar duas criações simultâneas
   para o mesmo intervalo (ver `tests/integration/booking-conflict`) ⇒ exatamente uma sucede; a outra
   recebe `slot_unavailable`. Garantia validada no banco.
6. **Ownership (FR-010..FR-012, SC-003)**: um cliente não vê nem cancela agendamento de outro.
7. **Cancelar libera horário (FR-013, SC-004)**: cancelar um agendamento ⇒ aquele horário reaparece
   como livre em nova consulta.
8. **Auth obrigatório (FR-001)**: tentar criar sem sessão ⇒ recusado como não-autorizado.

## Verificar a exclusion constraint diretamente (opcional)

```sql
-- Deve listar a constraint booking_no_overlap do tipo EXCLUDE
SELECT conname, contype FROM pg_constraint WHERE conname = 'booking_no_overlap';

-- Deve falhar com SQLSTATE 23P01 ao inserir um segundo booking ativo sobreposto
```

## Resultado esperado

Todos os cenários acima passam; os testes de unidade e integração ficam verdes. A não-sobreposição é
demonstrável no nível de dados (constraint presente e rejeitando sobreposição), cumprindo o objetivo
central do MVP.
