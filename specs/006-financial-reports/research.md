# Research: Financeiro — Balancete e Histórico (F006)

Feature de **leitura pura** sobre o razão da F005. Este documento consolida as decisões técnicas
(todas fechadas pelo usuário) e resolve a única tensão aparente entre elas (conversão de fuso na
query × preservar o índice no WHERE). Nenhuma decisão pende de clarificação.

---

## D1 — Agregação por `$queryRaw` tipado, não `Prisma.groupBy`

**Decision**: caixa (US1) e breakdown (US2) usam `prisma.$queryRaw` **tipado**, com `Prisma.sql` e
**placeholders parametrizados** (nunca interpolação de string). Não se usa `Prisma.groupBy`/
`aggregate`.

**Rationale**: o `groupBy` do Prisma não expressa `SUM(...) FILTER (WHERE ...)`, `GROUP BY` com
baldes de valor `null` rotulados, nem `COALESCE(SUM,0)` numa passada. O `$queryRaw` faz tudo
isso e retorna colunas `NUMERIC` que tipamos como `Prisma.Decimal`.

**Alternatives considered**: (a) várias chamadas `aggregate` + soma em JS → mais round-trips, sem
baldes de `null`, dinheiro escaparia para `Number`; (b) `findMany` + agregação em JS → lê o razão
inteiro por período, perde o índice e viola FR-003 ("conversão na query, não em pós-processamento").

**Segurança**: `$tz` e limites são **parâmetros** (`Prisma.sql`), sem interpolar string → sem SQL
injection (Princípio I).

---

## D2 — Semana ISO (segunda-feira)

**Decision**: a semana começa na **segunda-feira**. No Postgres, `date_trunc('week', ts)` já é ISO
(segunda); no app, `DateTime.startOf('week')` do Luxon também é ISO (segunda). As duas fontes
concordam — FR-003 satisfeito sem lógica extra.

**Rationale**: evita off-by-one de início de semana e mantém consistência entre a derivação de
limites (app/Luxon) e qualquer truncamento no banco.

---

## D3 — Limites de período: derivados uma vez, range no WHERE (índice preservado)

**Decision**: os limites `[startUtc, endUtc)` de um período (dia/semana/mês/ano) são derivados **uma
vez** no fuso da barbearia e convertidos a UTC; o WHERE da agregação filtra
`occurredAt >= $start AND occurredAt < $end` — **range sobre a coluna nua**, que usa o índice
`(barbershopId, occurredAt)` da F005. **Nunca** se aplica função sobre `occurredAt` no WHERE (isso
mataria o índice).

**Relação com D1**: usa-se `$queryRaw` (D1) pelo shape da agregação (FILTER/GROUP BY/COALESCE), mas a
**bucketização é por range em UTC**, não por `AT TIME ZONE` por linha —

- Os limites `[startUtc, endUtc)` são derivados **na aplicação**, via helper em `src/domain/time`
  (Luxon) — a fronteira única de fuso do projeto (Princípio VII). Recebe `(referenceLocalDate,
  granularity, timeZone)` e devolve `{ startUtc, endUtc }`. O WHERE compara `occurredAt` a **dois
  escalares UTC** (sargável, índice usado); a query segue tipada/parametrizada.
- Para **período único** (caixa/breakdown de US1/US2) **não** se usa `AT TIME ZONE`/`date_trunc` na
  query — dispensados pela Clarify FR-003. A semântica ISO-Monday é garantida por Luxon
  `startOf('week')` (equivalente ao `date_trunc('week')` do Postgres — ver D2).

**Alternatives considered**: derivar os limites **dentro** do `$queryRaw` num CTE
(`AT TIME ZONE`/`date_trunc` → `lo`/`hi`, comparados como escalares InitPlan). Também sargável e
também honra D1/D2/D3, mas introduz math de fuso em SQL fora de `src/domain/time`. Rejeitado por
coesão (uma só fronteira de fuso) e testabilidade (o helper Luxon é unit-testável sem banco). A
opção CTE fica registrada como equivalente caso a derivação app-side se mostre insuficiente.

**DST**: derivação de `endUtc` soma o intervalo em **wall-clock local** antes de converter a UTC
(Luxon cuida disso). O Brasil não tem mais horário de verão desde 2019, mas a regra fica correta em
geral.

---

## D4 — Período vazio → zeros

**Decision**: `COALESCE(SUM(amount), 0)` em cada total e balde; um período sem lançamentos devolve
`0.00`, nunca `null` (FR-005). A camada de aplicação não precisa tratar `null` de agregação.

---

## D5 — Dinheiro em `Prisma.Decimal`, serialização na fronteira Server/Client

**Decision**: colunas `NUMERIC(10,2)` retornam como `Prisma.Decimal`; `entradas`, `saidas`, cada
balde e o `saldo = entradas.minus(saidas)` são calculados em `Decimal` (nunca `Number`/float —
FR-023). Na fronteira Server Component → Client Component (ou no retorno da Server Action), os
`Decimal` são serializados para **string** (`.toString()`), porque o Next.js não serializa `Decimal`
por RSC/props.

**Rationale**: mesma disciplina da F005 (que já serializa `price.toString()` na `ledger/page.tsx`).
Preserva a exatidão decimal até a exibição.

---

## D6 — Breakdown: `GROUP BY` com baldes de `null`

**Decision**: entradas → `WHERE type='INCOME'` + `GROUP BY paymentMethod`; despesas →
`WHERE type='EXPENSE'` + `GROUP BY category`. Linhas com `paymentMethod IS NULL` mapeiam para o balde
**"não informado"**; `category IS NULL` para **"sem categoria"** (FR-007/FR-008). A soma dos baldes é
exatamente o total correspondente do caixa (FR-009/SC-004), pois vêm do mesmo filtro `isActive` +
range + `barbershopId`, só com `GROUP BY` adicional.

**Categoria**: texto livre da F005, agregado **como está** (sem normalização/lista fechada — FR-008).

---

## D7 — Escopo de todas as agregações

**Decision**: todo `$queryRaw` de caixa/breakdown filtra `isActive = true` e `barbershopId = $shop`
(FR-004). Inativos e outras barbearias nunca entram em total/saldo/balde.

---

## D8 — Listagem (US3) e histórico (US5): keyset por `findMany`

**Decision**: listagem e histórico usam `prisma.findMany` normal (sem SQL cru — não há
bucketização). Paginação **keyset** composta:

```
WHERE (occurredAt < $cursorOccurredAt)
   OR (occurredAt = $cursorOccurredAt AND id < $cursorId)
ORDER BY occurredAt DESC, id DESC
```

Primeira página omite o `WHERE` do cursor. `take = pageSize + 1` (11 para página de 10): se vierem 11,
`hasMore = true` e a 11ª vira o próximo cursor; devolve-se 10 (FR-010/FR-011). Sem `OFFSET`, sem
`COUNT`.

**Rationale**: desempate determinístico por `id` sob `occurredAt` empatado (SC-006). Aproveita o
índice `(barbershopId, occurredAt)`; o `id` desempata em memória dentro do mesmo `occurredAt`.

**Cursor na fronteira**: o cursor trafega como `{ occurredAtIso, id }` (string), validado no
servidor (parse de data + string id) antes de compor o WHERE — o cliente nunca injeta SQL.

---

## D9 — Filtros combináveis (US3)

**Decision**: filtros compostos no `where` do Prisma, em **conjunção** (FR-012): `period`
(→ range `occurredAt`, derivado como em D3), `type` (INCOME/EXPENSE), `origin` (BOOKING/WALK_IN/
EXPENSE), `paymentMethod` e `category`. Os baldes especiais mapeiam para `paymentMethod: null` /
`category: null`. `isActive` default `true`; o filtro explícito **"mostrar inativos"** troca para
`{}` (ativos + inativos) e a UI marca os inativos (FR-015) — inativos **nunca** entram em total (o
caixa/breakdown ignora `isActive=false` sempre, D7).

**Whitelist**: os campos e valores de filtro são validados contra enums/campos conhecidos no
servidor (Princípio I) — nada de `where` arbitrário vindo do cliente.

---

## D10 — Include de itens na listagem

**Decision**: `include`/`select` **direto** dos itens na listagem (não busca lazy na expansão). Com
página de 10 e itens pequenos, o custo é aceitável e evita round-trips extra na expansão. `select`
enxuto (só os campos exibidos: `id`, `occurredAt`, `type`, `origin`, `description`, `paymentMethod`,
`amount`, `isActive`, e `items { description, amount }`).

**Rationale**: simplicidade (expansão é puramente client-side, sem nova busca). Reavaliar só se o
volume de itens por lançamento crescer (não é o caso — receita tem 1..poucos itens).

---

## D11 — Histórico do CLIENT: filtro sempre da sessão

**Decision**: `where { clientId: session.user.id, type: 'INCOME', isActive: true }`, `ORDER BY
occurredAt DESC, id DESC`, mesmo keyset. `clientId` vem **sempre** da sessão (`requireUser`), **nunca**
do input (FR-021). Não usa `requireOwner` — qualquer autenticado vê o próprio histórico (FR-019).
Walk-in anônimo (`clientId = null`) nunca casa; despesas (`type='EXPENSE'`) e lançamentos de outros
clientes ficam de fora por construção (FR-020/SC-010/SC-011).

---

## D12 — Autorização por superfície

**Decision**: caixa/breakdown/razão/inativação → `requireOwner` no servidor (FR-022). Histórico do
cliente → `requireUser` + filtro server-side. As páginas do OWNER seguem o padrão de `redirect` da
`owner/ledger/page.tsx` (visitante→login, cliente→home).

---

## D13 — Reuso do soft delete da F005 (sem mudança)

**Decision**: a inativação a partir da listagem (US4) chama a **mesma** Server Action
`deactivateLedgerEntry({ ledgerEntryId })` e o core `deactivate-ledger-entry.ts` da F005 — **sem
alterar assinatura nem reasons** (`entry_not_found`/`already_inactive`). O core já aceita qualquer id
(confirmado no item 19), então "inativar qualquer lançamento, não só o último" (FR-017) é obtido
**apenas** expondo a ação em cada linha ativa. Se durante a implementação surgir a necessidade de
mudar o core/action da F005, **PARAR e reportar** (Princípio VI) — não alterar.

**UI**: o botão "Inativar (corrigir)" migra da home do ledger (F005) para as linhas da listagem
(US4); o banner de "último lançamento" da F005 pode ser removido/simplificado — é **superfície**, não
core (item 16).

---

## D14 — Estrutura de módulos (padrão do projeto)

**Decision**: três cores de leitura novos em `src/server/ledger/` (`cash-summary.ts`,
`ledger-list.ts`, `client-history.ts`), cada um com função testável recebendo
`ownerId`/`barbershopId`/`userId` + params explícitos (como os cores da F005). Server Actions finas
(`list-ledger.ts`, `list-my-ledger.ts`) só fazem `requireOwner`/`requireUser`, (des)serializam e
delegam. Server Components para render inicial; ilhas client mínimas para filtros, "carregar mais" e
inativar (item 15). **Nenhum** arquivo de core da F005 é tocado (item 14).

---

## D15 — Fonte do fuso

**Decision**: o fuso é o campo `Barbershop.timezone` (default `America/Sao_Paulo`), lido por
requisição e passado como parâmetro — o **mesmo** padrão da F001 (`create-booking.ts:66` etc.). No
MVP de barbearia única, resolve-se a barbearia do OWNER (`getOwnerBarbershopId` + leitura do
`timezone`) e, no histórico do cliente, a barbearia única do MVP. Nunca hardcode da string.

---

## Testes (perfil da feature — item 17)

Test-first para os cores de leitura, integração contra Postgres real, fixtures em datas/fusos
conhecidos (estendendo `tests/integration/ledger/fixtures.ts`). Casos obrigatórios:

- **Borda de fuso (SC-003)**: lançamento às 22h/23h locais em SP perto da virada UTC cai no dia/
  semana/mês/ano **local** correto, não no dia UTC seguinte.
- **Inativo fora de tudo (SC-002)**: um `isActive=false` no período não entra em entradas/saídas/
  saldo nem em nenhum balde; aparece na listagem só sob "mostrar inativos", marcado.
- **Soma = total (SC-004)**: soma dos baldes de forma de pagamento = total de entradas; soma dos
  baldes de categoria = total de saídas; saldo = entradas − saídas.
- **Período vazio (SC-005)**: zeros, sem erro.
- **Keyset estável (SC-006)**: com vários `occurredAt` **empatados**, "carregar mais" não repete nem
  pula; ordem por `id` desc desempata.
- **Histórico não vaza (SC-010/SC-011)**: cliente A não vê receitas de B, nem despesas, nem
  anônimos, nem inativos; id de cliente no input é ignorado (filtro = sessão).
- **Autorização (SC-011)**: não-OWNER recusado no razão/caixa/inativação (`requireOwner`).
