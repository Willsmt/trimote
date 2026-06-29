# Phase 0 — Research: Agendamento Online de Barbearia (MVP)

Consolidação das decisões técnicas e resolução dos pontos em aberto do Technical Context.

## D1 — Não-sobreposição garantida no nível de dados

- **Decision**: Usar PostgreSQL `EXCLUDE USING gist` sobre uma coluna/expressão `tstzrange(startsAt,
  endsAt, '[)')`, habilitando a extensão `btree_gist` para combinar igualdade (`barbershopId`) com
  sobreposição de range. A constraint é **parcial**: aplica-se apenas a `status = 'ACTIVE'` (via
  `WHERE status = 'ACTIVE'`). Implementada por **migration SQL manual**, pois o Prisma não modela
  exclusion constraints em `schema.prisma`.
- **Rationale**: Cumpre o Princípio II e FR-008/FR-009 — a impossibilidade de sobreposição é
  propriedade do armazenamento, imune a condições de corrida da aplicação. A constraint parcial
  permite que um horário cancelado (soft delete) seja reusado por outro cliente (FR-013).
- **Alternatives considered**:
  - *Checagem só na aplicação (SELECT antes do INSERT)*: rejeitada — sofre TOCTOU/condição de corrida
    sob concorrência; viola o Princípio II.
  - *Advisory locks / `SERIALIZABLE`*: rejeitada como mecanismo primário — mais frágil e custoso que
    uma constraint declarativa; a exclusion constraint é a garantia mais simples e correta.
  - *`UNIQUE` em (barbershopId, startsAt)*: rejeitada — impede início idêntico, mas **não** impede
    sobreposição parcial de durações diferentes.

### Forma da migration (referência, não código final)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "barbershopId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status = 'ACTIVE');
```

- O fluxo: `prisma migrate dev --create-only` para gerar o arquivo, depois **editar** o SQL gerado
  adicionando os comandos acima.
- **Intervalo semiaberto `'[)'`** (decisão consolidada): o range é `tstzrange(starts_at, ends_at, '[)')`,
  que inclui o início e exclui o fim. Assim, um agendamento que termina às 10:00 e outro que começa às
  10:00 **não** são considerados conflito — adjacência válida, sem perder slots por "encostar".
- **`endsAt` materializado** (decisão consolidada): `ends_at` (timestamptz, UTC) é **persistido** no
  Booking, calculado na criação como `starts_at` + duração do serviço, **dentro da mesma transação**
  que cria o agendamento (ver D8). Não pode ser derivado em runtime: a exclusion constraint indexa o
  intervalo e vive apenas no SQL da migration (o Prisma não a expressa no `schema.prisma`), então o fim
  do intervalo precisa existir materializado para ser indexável pelo GiST.

## D2 — Tradução do erro da exclusion constraint (Prisma)

- **Decision**: Envolver a criação do agendamento em `prisma.$transaction`. Capturar
  `Prisma.PrismaClientKnownRequestError` e tratar a violação de exclusion constraint como recusa de
  negócio "horário indisponível" (FR-015). A violação de exclusion **não** mapeia para o código `P2002`
  (que é unique violation); o Prisma a expõe como erro de constraint do Postgres (SQLSTATE `23P01`,
  classe genérica frequentemente reportada como `P2010`/raw error com `code` `23P01`). Portanto, o
  handler deve inspecionar a mensagem/SQLSTATE da causa, não assumir `P2002`.
- **Rationale**: É o ponto mais sujeito a erro do plano (destacado pelo usuário). Tratar
  explicitamente — e testar — garante que o caminho de conflito retorna uma recusa limpa, sem
  vazar detalhe interno (Princípio I) e sem criar agendamento.
- **Alternatives considered**:
  - *Assumir `P2002`*: rejeitada — incorreta para exclusion constraints; falharia silenciosamente em
    capturar o conflito.
  - *Checar disponibilidade na app e pular o tratamento de erro*: rejeitada — reintroduz a corrida.
- **Test obligation (Princípio IV)**: teste de integração que dispara dois inserts concorrentes para o
  mesmo intervalo e verifica que exatamente um sucede e o outro recebe a recusa traduzida.

## D3 — Modelo de horário de funcionamento

- **Decision**: Tabela `OpeningHours` com `(barbershopId, weekday, opensAtMinutes, closesAtMinutes)`,
  onde `weekday` é 0–6 e `opensAtMinutes/closesAtMinutes` são horários locais em minutos desde a
  meia-noite (`America/Sao_Paulo`), evitando ambiguidade de fuso. Um dia sem linha = fechado (sem
  slots — FR-005, edge case "dia sem expediente").
- **Rationale**: Simples e suficiente para o MVP (uma barbearia, uma cadeira). Mantém o horário de
  funcionamento como dado pré-cadastrado (sem CRUD do dono — escopo).
- **Alternatives considered**:
  - *Intervalos por data específica / exceções/feriados*: fora de escopo do MVP.
  - *Múltiplas janelas por dia (almoço)*: adiado; o modelo permite estender com mais de uma linha por
    weekday se necessário, mas o MVP assume uma janela contínua por dia.

## D4 — Biblioteca de data/fuso e camada de tempo

- **Decision**: Centralizar toda conversão em `src/domain/time/`. Usar **Luxon** para converter entre
  UTC (armazenamento) e `America/Sao_Paulo` (cálculo). Nenhum outro módulo chama API de fuso
  diretamente — toda a camada `src/domain/time/` é a única fronteira de conversão.
- **Rationale**: Princípio VII e FR-014. Luxon oferece API de timezone IANA de primeira classe, mais
  explícita e menos propensa a erro em conversões envolvendo horário de verão do que abordagens
  baseadas em offset. Uma única fonte de verdade para fuso evita o uso implícito do fuso do servidor.
  (Nota: o Brasil não observa DST atualmente, mas a escolha mantém a regra robusta a mudanças de
  política e a operação em qualquer fuso de servidor.)
- **Alternatives considered**:
  - *`date-fns` + `date-fns-tz`*: válida e leve, mas a manipulação de timezone é menos explícita; foi o
    default anterior, agora preterido em favor da API IANA de primeira classe do Luxon.
  - *`Date` nativo / `Intl` direto espalhado pelo código*: rejeitado — viola a centralização e é
    propenso a erro.

## D5 — Cálculo de disponibilidade (lógica pura)

- **Decision**: Função pura em `src/domain/availability/` que recebe `{ openingHours, durationMinutes,
  activeBookings, slotStepMinutes (default 30), now }` e retorna a lista de horários de início livres.
  Sem I/O. Um slot `t` é livre sse `[t, t + duration)` couber em `[opensAt, closesAt)` **e** não
  colidir com nenhum booking ativo **e** `t > now` (tudo em `America/Sao_Paulo`).
- **Rationale**: Atende FR-003..FR-006; ser pura permite test-first com cobertura de bordas (Princípio
  IV) sem banco.
- **Alternatives considered**:
  - *Calcular slots em SQL*: rejeitado para o MVP — a lógica pura é mais testável e legível (Princípio
    III); o banco continua sendo a autoridade final via exclusion constraint na escrita.

## D6 — Autenticação e ownership

- **Decision**: NextAuth/Auth.js com Prisma adapter (tabelas `User`, `Account`, `Session`) e provider
  Google OAuth. Credenciais Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) e `NEXTAUTH_SECRET`
  apenas via `.env`. Toda Server Action de booking valida a sessão no servidor e usa o `user.id` da
  sessão como owner; consultas de leitura/cancelamento filtram por `userId` (FR-010..FR-012).
- **Rationale**: Princípio I (validação no servidor, segredos em env) e requisitos de ownership.
- **Alternatives considered**:
  - *Confiar em parâmetro de userId vindo do cliente*: rejeitado — viola Princípio I; ownership deve
    derivar da sessão no servidor.

## D7 — Testes e ferramenta

- **Decision**: **Vitest** para unidade (domínio puro de disponibilidade e camada de tempo). Testes de
  integração contra um Postgres real (mesma imagem do docker-compose) para validar a exclusion
  constraint e a tradução do erro sob concorrência. Separação mantida: testes de `src/domain/` rodam
  **sem banco**; testes de conflito/concorrência rodam contra Postgres.
- **Rationale**: A garantia central (não-sobreposição) é de banco; precisa de integração real, não de
  mock. O domínio puro cobre as bordas de disponibilidade rapidamente (Princípio IV). Vitest é
  preferido a Jest pela integração mais natural com o ecossistema Vite/TypeScript e pela execução
  rápida dos testes de domínio.
- **Alternatives considered**:
  - *Jest*: alternativa madura, mas exige mais configuração para TypeScript/ESM e tende a ser mais
    lento; preterido em favor do Vitest.
  - *Mockar o Prisma para o teste de conflito*: rejeitado — não exercita a constraint real, que é o
    ponto da garantia.

## D8 — Booking com `endsAt` materializado

- **Decision**: O `Booking` persiste `endsAt` (timestamptz, UTC), calculado na criação como
  `startsAt` + duração do serviço, **dentro da mesma transação** que insere o agendamento. Não é
  derivado em runtime.
- **Rationale**: A exclusion constraint indexa um intervalo de tempo (`tstzrange(starts_at, ends_at,
  '[)')`) e vive somente no SQL da migration — o Prisma não a expressa no `schema.prisma`. Para o GiST
  indexar e o `&&` comparar o intervalo, o fim precisa existir materializado na linha. Calcular na
  mesma transação garante consistência entre `endsAt` e a duração vigente no momento da reserva (a
  duração do catálogo pode mudar depois sem afetar bookings já criados).
- **Alternatives considered**:
  - *Derivar `endsAt` em runtime / coluna gerada a partir da duração do serviço*: rejeitado — a duração
    vive em outra tabela (`BarbershopService`) e pode mudar; além disso, a constraint precisa de um
    valor concreto e estável na própria linha do Booking para indexar.
  - *Guardar só `startsAt` + `durationMinutes` e comparar na app*: rejeitado — reintroduz a checagem na
    aplicação e não alimenta a exclusion constraint (viola Princípio II).

## Unknowns resolvidos

Todos os itens do Technical Context foram resolvidos; **nenhum NEEDS CLARIFICATION permanece**. Pontos
configuráveis com default definido: `slotStepMinutes = 30` (D5); biblioteca de fuso = date-fns-tz (D4),
ambos ajustáveis sem alterar a arquitetura.
