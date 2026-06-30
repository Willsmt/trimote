# Trimote

Sistema de agendamento online para uma barbearia. O cliente vê os serviços, escolhe um dia e um
horário livre e agenda por conta própria — com a garantia de que **nunca** há duplo agendamento no
mesmo horário (não-sobreposição garantida no nível de dados).

Feature do MVP: [`specs/001-barber-booking`](specs/001-barber-booking/).

## Stack

- **Next.js 16** (App Router, TypeScript) — UI + Server Actions
- **PostgreSQL** (via Docker) + **Prisma** (ORM)
- **NextAuth / Auth.js** com **Google OAuth**
- **Luxon** para fuso horário (armazenamento em UTC; lógica em `America/Sao_Paulo`)
- **Tailwind CSS** + ShadCN UI
- **Vitest** (testes de unidade e de integração)

## Pré-requisitos

- Node.js 20+
- Docker + Docker Compose
- Credenciais Google OAuth (Client ID/Secret) para login

## Configuração

1. Copie o arquivo de exemplo de ambiente e preencha os valores:

   ```bash
   cp .env.example .env
   ```

   Variáveis (o `.env` **nunca** é commitado):

   | Variável | Descrição |
   |----------|-----------|
   | `DATABASE_URL` | Conexão Postgres. Local (docker-compose) usa a porta **5433**: `postgresql://postgres:postgres@localhost:5433/trimote?schema=public` |
   | `NEXTAUTH_SECRET` | Segredo do NextAuth (gere um valor aleatório) |
   | `NEXTAUTH_URL` | URL da app (ex.: `http://localhost:3000`) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciais do Google Cloud Console |
   | `OWNER_EMAIL` | E-mail do dono. O seed promove (ou cria) este usuário como `OWNER` (ver Painel do dono) |

2. Suba o banco:

   ```bash
   docker compose up -d
   ```

   > A porta do host é **5433** (a 5432 pode estar ocupada por outro Postgres local). O container
   > usa 5432 internamente.

3. Instale as dependências e aplique as migrations:

   ```bash
   npm install
   npm run db:migrate        # prisma migrate dev (aplica o schema + a exclusion constraint)
   npm run db:seed           # popula barbearia, expediente e serviços
   ```

4. Rode a aplicação:

   ```bash
   npm run dev               # http://localhost:3000
   ```

## Não-sobreposição no nível de dados

A garantia de que dois agendamentos ativos não se sobrepõem **não** depende da aplicação: é uma
**PostgreSQL exclusion constraint** (`EXCLUDE USING gist` sobre `tstzrange(startsAt, endsAt, '[)')`,
com a extensão `btree_gist`), parcial em `status = 'ACTIVE'` e com `CHECK (endsAt > startsAt)`.

Como o Prisma não modela exclusion constraints no `schema.prisma`, ela é adicionada por **SQL manual**
dentro da migration inicial (ver `prisma/migrations/*/migration.sql` e
`prisma/sql/booking-exclusion-constraint.sql`). O intervalo semiaberto `'[)'` torna a adjacência
válida (um agendamento que termina às 10:00 e outro que começa às 10:00 não conflitam).

## Tempo

Todos os instantes são armazenados em **UTC** (`timestamptz`). Todo cálculo de disponibilidade,
conflito e "passado" ocorre em **`America/Sao_Paulo`**, centralizado em `src/domain/time` (Luxon) —
nenhuma conversão de fuso fora dessa camada.

## Scripts

| Script | Ação |
|--------|------|
| `npm run dev` | Inicia a app em desenvolvimento |
| `npm run build` / `npm run start` | Build de produção / serve o build |
| `npm run lint` | Lint (ESLint) |
| `npm test` | Toda a suíte (unidade + integração) |
| `npm run test:unit` | Apenas unidade (`tests/unit`, **sem banco**) |
| `npm run test:integration` | Integração (`tests/integration`, **contra o Postgres**) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Popula os dados pré-cadastrados |

> Os testes de integração exigem o Postgres do `docker-compose` no ar.

## Painel do dono

O dono gerencia o catálogo de serviços e o horário de funcionamento em `/owner`
(`/owner/services`, `/owner/opening-hours`).

- **Papéis**: o usuário tem um `role` (`CLIENT` por padrão ou `OWNER`). Apenas `OWNER` acessa o
  painel; a verificação é **no servidor** (guard `requireOwner`) em toda página e ação de gestão.
- **Promoção a OWNER**: definida via `OWNER_EMAIL` no `.env`. O seed faz upsert idempotente: se já
  existe um usuário com esse e-mail (ex.: criado pelo login Google), define `role = OWNER`; senão,
  cria um placeholder que o login real depois casa por e-mail. Não há UI de gestão de usuários.
- **Serviços**: criar/editar/desativar/reativar. "Remover" um serviço em uso o **desativa**
  (soft delete via `isActive`), preservando agendamentos; a unicidade de nome entre serviços ativos
  é garantida por índice único parcial. A listagem pública (`/services`) mostra só os ativos.
- **Horário**: editar abertura/fechamento por dia ou marcar o dia como fechado. Muda só a
  disponibilidade futura; agendamentos existentes nunca são cancelados.

## Estrutura

```text
prisma/          # schema, migrations (exclusion constraint, índice único parcial), seed, sql/
src/
├── app/         # rotas: /services, /booking, /my-bookings, /owner/*, /api/auth/[...nextauth]
├── components/  # UI (client), incl. owner/
├── domain/      # lógica pura sem I/O: availability, time (test-first)
├── server/      # actions/ (Server Actions), booking/ + owner/ (core testável), auth/, db/
└── lib/
tests/
├── unit/        # availability, time (sem banco)
└── integration/ # booking-conflict, booking-ownership, owner-authorization, service-lifecycle
```

Padrão: as Server Actions (`src/server/actions/`) são wrappers finos sobre um core em
`src/server/booking/` e `src/server/owner/`; o owner deriva sempre da sessão no servidor (guard
`requireOwner` para gestão).

## Convenções

- Conventional Commits.
- Objetos de banco e código em **inglês**; comentários e documentação em **português**.
- Segredos apenas via variáveis de ambiente; `.env` nunca é versionado.

Princípios do projeto: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
