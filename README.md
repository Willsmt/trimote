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

## Navegação e sessão

Um **header único** (montado no layout raiz) aparece em todas as páginas e torna a app navegável sem
digitar URLs. Feature: [`specs/003-nav-session`](specs/003-nav-session/).

- **Entrar / Sair**: o visitante inicia o login com Google pela ação "Entrar"; o usuário autenticado
  encerra a sessão por "Sair" e volta à condição de visitante. A indicação de sessão mostra quem está
  logado (nome ou e-mail).
- **Links por papel**: visitante vê apenas "Serviços" (listagem pública) + "Entrar"; o `CLIENT` vê
  "Agendar" e "Meus agendamentos"; o `OWNER` vê adicionalmente o "Painel".
- **Decisão no servidor**: quais links exibir é decidido **no servidor** — a navegação lê a sessão e o
  `role` da **mesma fonte de verdade do `requireOwner`** (o `role` no banco, por requisição), refletindo
  o papel atual e não um claim cacheado.
- **Visibilidade ≠ segurança**: esconder um link é conveniência de UI. A barreira real das áreas
  restritas continua sendo a verificação no servidor (`requireOwner`); um `CLIENT` que acesse `/owner`
  diretamente é barrado pelo servidor, independentemente do header.

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

## Remarcação

O cliente dono pode **mover** um agendamento ativo e futuro para outro horário e/ou **trocar o
serviço**, mantendo a **mesma identidade** — é um `UPDATE` da mesma linha (não cancela e recria), e o
horário antigo é liberado automaticamente. Feature: [`specs/004-reschedule-booking`](specs/004-reschedule-booking/).

- **Fluxo**: em "Meus agendamentos", a ação **Remarcar** aparece só em agendamentos ativos e futuros;
  ela leva a uma página que valida a posse no servidor, onde o cliente escolhe o serviço (padrão = o
  atual), um novo dia e um horário livre, e confirma. A disponibilidade exclui o próprio agendamento
  (`excludeBookingId`), para ele não bloquear o próprio horário nem as adjacências.
- **Enforcement no servidor**: posse e elegibilidade são verificadas no core **antes** de qualquer
  trabalho ou escrita — nenhuma recusa altera o agendamento. A não-sobreposição continua sendo a
  exclusion constraint (`23P01` traduzido em `slot_unavailable`); a app apenas traduz a violação.
  A visibilidade da ação é conveniência de UI; o servidor é a barreira.
- **Reasons de recusa** (curto-circuito, sem efeito colateral):

  | Reason | Significado |
  |--------|-------------|
  | `not_found` | Agendamento inexistente. |
  | `not_owner` | Agendamento de outro cliente. |
  | `not_active` | Agendamento não está `ACTIVE` (ex.: cancelado). |
  | `booking_in_past` | O agendamento a remarcar já começou/passou (fronteira pelo início). |
  | `no_change` | Mesmo serviço **e** mesmo horário (recusa amigável, sem escrever). |
  | `service_not_found` | Serviço escolhido inexistente. |
  | `service_inactive` | **Troca** para um serviço inativo (manter o serviço atual não dispara). |
  | `in_the_past` | Novo horário-alvo no passado. |
  | `outside_opening_hours` | O serviço escolhido não cabe na janela do dia. |
  | `slot_unavailable` | Colisão com outro agendamento ativo (`23P01`), incluindo concorrência. |

- **Escopo**: sem migration (opera sobre colunas existentes de `Booking`). O único arquivo da 001
  alterado é `get-available-slots.ts` (parâmetro opcional `excludeBookingId`); o domínio puro
  `computeAvailableSlots` e os cores `createBooking`/`cancelBooking` ficam intactos.

## Financeiro (captura de lançamentos)

O OWNER registra todo o dinheiro que entra e sai da barbearia, formando a base do balancete
(relatórios/agregações ficam para a F006). Feature: [`specs/005-financial-ledger`](specs/005-financial-ledger/).
Entidades: `LedgerEntry` (razão) e `LedgerEntryItem` (itens); valores em `Decimal(10,2)`, instantes em
UTC. Autorização por **role OWNER** (`requireOwner`) — **não** pela posse do booking (no `Booking`,
`userId` é o cliente que agendou; o OWNER conclui qualquer atendimento).

- **Concluir atendimento (US1)**: marca o booking como `COMPLETED` e gera, no **mesmo `$transaction`**,
  um `LedgerEntry` de receita (`INCOME`/`BOOKING`) com um item do serviço agendado. O valor é um
  **snapshot** do preço no ato da conclusão (lido **sem** filtrar `isActive` — registra o que
  aconteceu); mudar o preço depois não altera lançamentos passados.
- **Extras (US2)**: capturados **só** no ato da conclusão/registro — item de serviço (snapshot) ou item
  manual; o valor do lançamento é a soma dos itens, validada na transação. Após concluído, a única
  mutação é o soft delete.
- **Walk-in (US3)**: receita (`INCOME`/`WALK_IN`) sem `bookingId`, **sem** tocar a agenda; cliente
  cadastrado, nome livre ou anônimo.
- **Despesa (US4)**: `EXPENSE`/`EXPENSE` com descrição, categoria e valor — sem itens e sem cliente.
  O valor é sempre positivo; o sinal (entrada/saída) vem do `type`.
- **Correção (US5)**: **soft delete** (`isActive=false`), nunca hard delete nem estorno. Inativar um
  lançamento de origem `BOOKING` **não** reabre o agendamento (permanece `COMPLETED`).
- **`origin` × `paymentMethod`**: eixos ortogonais — a origem é o evento; a forma de pagamento é o
  meio (opcional). `ONLINE`/`externalRef` deixam o modelo pronto para pagamento online, sem fluxo
  ativo agora. **Não** há constraint de banco "receita exige concluído" (fica na aplicação — FR-014).
- **Estado terminal na F004**: concluir/remarcar/cancelar um agendamento já concluído são recusados
  com o reason próprio **`already_completed`** (distinto de `not_active`/`already_cancelled`), integrado
  na ordem de verificação existente de cada core.
- **Reasons de recusa**: conclusão — `booking_not_found`, `already_completed`, `booking_cancelled`,
  `service_not_found`, `invalid_amount`; walk-in — `no_items`, `invalid_amount`, `service_not_found`,
  `client_not_found`; despesa — `invalid_amount`; correção — `entry_not_found`, `already_inactive`.
- **Escopo**: migração Prisma normal (novos enums, `COMPLETED` aditivo, tabelas do ledger); a exclusion
  constraint `booking_no_overlap` **não** é tocada. Sem relatório/agregação/caixa/visão do cliente
  (F006) e sem gateway/webhooks (feature futura).

## Financeiro (balancete e histórico)

Transforma os lançamentos da F005 em informação. Feature de **leitura pura**:
[`specs/006-financial-reports`](specs/006-financial-reports/) — **nenhuma migração, nenhuma entidade
nova, nenhum caminho de escrita novo**; a única mutação continua sendo o soft delete da F005,
reutilizado sem alteração. Dinheiro em `Decimal` (serializado como string na fronteira Server→Client).

- **Caixa por período (US1)**: em `/owner/finance`, o OWNER vê entradas, saídas e **saldo**
  (entradas − saídas, pode ser negativo) por **dia/semana/mês/ano** com navegação anterior/próximo
  (abre no mês corrente). Só lançamentos ativos contam.
- **Breakdown (US2)**: entradas por forma de pagamento (`null` → "não informado") e despesas por
  categoria (`null` → "sem categoria"); a soma dos baldes bate com os totais.
- **Fuso**: os limites do período são derivados no **fuso da barbearia** (`Barbershop.timezone`) e
  aplicados como **range em UTC** `[início, fim)` sobre `occurredAt` — usa o índice
  `(barbershopId, occurredAt)`, **sem** `AT TIME ZONE`/`date_trunc` na query. Semana ISO (segunda).
- **Razão (US3)**: listagem paginada por **keyset** `(occurredAt, id)` desc (página de 10, "carregar
  mais", nunca `OFFSET`), filtros combináveis (período/tipo/origem/forma/categoria), expansão de itens
  e "mostrar inativos" (marcados, fora de qualquer total).
- **Inativar (US4)**: cada linha ativa oferece "Inativar (corrigir)", reutilizando a Server Action
  `deactivateLedgerEntry` da F005 **sem mudança** — qualquer lançamento (não só o último) pode ser
  corrigido; caixa e listagem refletem.
- **Histórico do cliente (US5)**: em `/my-spending`, qualquer autenticado vê as **próprias receitas
  ativas** (`clientId` = sessão, **no servidor**; nunca do input). Não expõe despesas, lançamentos de
  outros clientes, walk-ins anônimos nem inativos.
- **Autorização**: caixa/breakdown/razão/inativação exigem `requireOwner`; o histórico exige apenas
  sessão autenticada. Consistência: para o mesmo período, `saldo do caixa == Σ entradas − Σ saídas`
  da listagem. Sem gráficos/exportação/comparativos (fora de escopo).

## Multi-tenancy (negócios, donos e administração)

Plataforma multi-tenant: N negócios na mesma infra, cada um com serviços/agenda/financeiro e página
pública própria. Feature: [`specs/007-multi-tenancy`](specs/007-multi-tenancy/). Nomes generalizados
(**Business** ← Barbershop, **Service** ← BarbershopService; campo `segment`, default `barbershop`).

- **Duas migrations**: (1) **rename puro** por `ALTER TABLE RENAME` (hand-edited — o Prisma geraria
  DROP+CREATE e perderia dados/constraint); preserva a exclusion constraint `booking_no_overlap`, que
  passa a particionar por `businessId`. (2) **funcional**: `Role += ADMIN`, `BusinessMember`,
  `Business.slug @unique`, `Session.activeBusinessId`, + backfill. Gate entre elas: `pg_constraint` +
  a suíte inteira verde.
- **Papéis**: `ADMIN` é papel **de plataforma** (opera o `/admin`: cria negócios, promove donos). A
  **posse** de um negócio é um **vínculo** `BusinessMember` (N:N, papel OWNER; STAFF é fundação
  futura), **não** um papel global — `OWNER` saiu da autoridade do `Role` (fonte única = o vínculo).
  Guards distintos: `requireAdmin` (papel de plataforma) vs `requireOwner` ("é membro OWNER do negócio
  **ativo**").
- **Anti-escalação (5 camadas)**: nenhuma Server Action pública escreve `User.role` ou cria
  `BusinessMember`; role/vínculo lidos do banco por request; ADMIN só promove a OWNER (não existe
  "promover a ADMIN" — o 2º ADMIN é bootstrap de seed); `businessId` **nunca** vem do input em operação
  de dono (deriva do negócio ativo da sessão + revalidação de membership); ADMIN não opera negócios de
  terceiros.
- **Negócio ativo**: estado **server-side** (`Session.activeBusinessId`), revalidado por request. 1
  negócio → auto-selecionado; N → seletor; 0 → estado vazio. `businessId` como parâmetro de request
  seria a porta de IDOR (proibida).
- **Slug**: informado pelo ADMIN (pré-preenchido do nome), validado no servidor — formato
  `^[a-z0-9]+(-[a-z0-9]+)*$`, único e **fora dos reservados** (`RESERVED_SLUGS`: admin, api, b, booking,
  owner, login, my-bookings, my-spending). Imutável pela UI (QR codes). Página pública em `/b/[slug]`
  (slug inválido → 404); a rota global `/booking` redireciona e `/services` foi removida (catálogo é
  por negócio).
- **Cliente global**: conta única; `/my-bookings` e `/my-spending` agregam todos os negócios,
  rotulando cada item. Unicidade de nome de serviço ativo passou a ser **por negócio**.
- **Bootstrap do 1º ADMIN**: `OWNER_EMAIL=<email> npx tsx prisma/seed.ts` promove o operador a ADMIN e
  o vincula como dono do negócio showroom (idempotente). É a única elevação feita fora da plataforma.
- Fora de escopo: STAFF/agenda por profissional, personalização visual, marketplace, cobrança da
  plataforma, multi-vertical real, edição de slug.

## Estrutura

```text
prisma/          # schema, migrations (exclusion constraint, índice único parcial), seed, sql/
src/
├── app/         # rotas: /services, /booking, /my-bookings, /owner/*, /api/auth/[...nextauth]
├── components/  # UI: site-header (server) + auth-buttons (client), my-bookings, booking, owner/
├── domain/      # lógica pura sem I/O: availability, time (test-first)
├── server/      # actions/ (Server Actions), booking/ + owner/ + ledger/ (core testável), auth/, db/
└── lib/
tests/
├── unit/        # availability, time, ledger (sem banco)
└── integration/ # booking-conflict, booking-ownership, owner-authorization, service-lifecycle, reschedule, ledger
```

Padrão: as Server Actions (`src/server/actions/`) são wrappers finos sobre um core em
`src/server/booking/`, `src/server/owner/` e `src/server/ledger/`; o owner deriva sempre da sessão no
servidor (guard `requireOwner` para gestão e para a captura financeira).

## Convenções

- Conventional Commits.
- Objetos de banco e código em **inglês**; comentários e documentação em **português**.
- Segredos apenas via variáveis de ambiente; `.env` nunca é versionado.

Princípios do projeto: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
