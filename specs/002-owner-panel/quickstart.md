# Phase 1 — Quickstart / Validation Guide: Painel do Dono

Guia para validar a feature 002-owner-panel. Reusa o ambiente da 001. Não contém código de
implementação — referencia [data-model.md](./data-model.md) e
[contracts/owner-actions.md](./contracts/owner-actions.md).

## Pré-requisitos

- Ambiente da 001 funcionando (Postgres em Docker `:5433`, `.env` com `DATABASE_URL`, Google OAuth).
- Node 20+.

## Setup (mudanças da 002)

```bash
docker compose up -d
npm install
npm run db:migrate        # aplica: enum Role + User.role, BarbershopService.isActive,
                          # e a migration SQL manual do índice único parcial de nome
npm run db:seed           # mantém dados da 001; promove um usuário a OWNER (script/seed)
npm run dev               # http://localhost:3000/owner
```

> Promoção a OWNER no MVP: via seed/script (sem UI). Defina o e-mail do dono (ex.: variável
> `OWNER_EMAIL`) e rode o seed/script de promoção; sem isso, nenhum usuário é OWNER e o painel barra
> todos (comportamento correto).

## Testes (test-first — Princípio IV)

```bash
npm run test:unit          # validações puras de input (se houver)
npm run test:integration   # guard de autorização + ciclo de vida de serviço (contra Postgres)
```

## Cenários de validação (mapeados aos critérios de aceite)

1. **Acesso barrado (US3 / FR-001, SC-001)**: visitante e cliente comum (`role=CLIENT`) recebem recusa
   ao acessar `/owner` ou chamar qualquer ação de gestão. Dono (`role=OWNER`) entra.
2. **Criar serviço (US1 / FR-002, SC-002)**: dono cria um serviço; ele aparece na listagem pública de
   serviços (`/services`) imediatamente.
3. **Editar serviço (US1 / FR-004/FR-007)**: editar preço/duração reflete na listagem; um agendamento
   já criado mantém seu `endsAt` (duração antiga) — não é recalculado.
4. **Desativar serviço em uso (US1 / FR-005/FR-006, SC-004)**: tentar "remover" um serviço com
   agendamento ativo futuro → ele é desativado; some de `/services` mas o agendamento existente
   continua íntegro.
5. **Unicidade de nome ativo (FR-012/FR-013, SC-005)**: criar dois serviços ativos com o mesmo nome →
   o segundo é recusado (`name_taken`); reusar o nome de um serviço **desativado** é permitido.
6. **Editar expediente (US2 / FR-008/FR-009/FR-010)**: reduzir o fechamento de um dia → a
   disponibilidade pública daquele dia respeita o novo horário; `fechamento ≤ abertura` é recusado.
7. **Fechar dia (US2 / FR-008)**: marcar um dia como fechado → nenhum horário é oferecido nele.
8. **Expediente não cancela bookings (FR-011, SC-004)**: reduzir expediente com um booking fora do novo
   horário → o booking existente permanece; só a oferta futura muda.

## Verificações diretas no banco (opcional)

```sql
-- enum Role e default
SELECT column_default FROM information_schema.columns
  WHERE table_name='User' AND column_name='role';

-- índice único parcial de nome entre ativos
SELECT indexdef FROM pg_indexes WHERE indexname='barbershopservice_active_name_key';
```

## Resultado esperado

Todos os cenários passam; testes de integração (guard + ciclo de vida) verdes. Acesso restrito ao dono
no servidor, soft delete preservando bookings, e unicidade de nome entre ativos garantidos no nível de
dados.
