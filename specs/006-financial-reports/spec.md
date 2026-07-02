# Feature Specification: Financeiro — Balancete e Histórico

**Feature Branch**: `006-financial-reports`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Financeiro — balancete e histórico (F006). Transformar os lançamentos capturados na F005 em informação: o OWNER vê o caixa da barbearia por período (entradas, saídas, saldo) com breakdown por forma de pagamento e por categoria de despesa, e navega o razão completo de lançamentos com filtros e paginação; o CLIENT vê o histórico dos próprios gastos. Feature de LEITURA PURA — nenhum write path novo; a única mutação continua sendo o soft delete da F005, que aqui ganha a superfície correta (inativar a partir da listagem)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - OWNER vê o caixa por período (Priority: P1)

O OWNER autenticado escolhe um período (dia, semana, mês ou ano) e navega entre períodos
(anterior/próximo). Para o período selecionado, vê três números: **total de entradas** (receitas),
**total de saídas** (despesas) e **saldo** (entradas − saídas). Apenas lançamentos **ativos**
contam. Os limites de cada período são calculados no fuso da barbearia (campo `timezone`;
`America/Sao_Paulo` no MVP) sobre o momento do lançamento (armazenado em UTC): um lançamento às 22h
de terça em São Paulo pertence à terça de São Paulo, nunca ao dia UTC seguinte. Um período sem lançamentos mostra zeros, não erro nem tela vazia
quebrada.

**Why this priority**: É a razão de ser da feature — dá ao OWNER a visão do dinheiro da barbearia,
transformando os lançamentos crus da F005 em informação de gestão. Entrega valor por si só: sem
listagem nem breakdown, saber entradas/saídas/saldo de um período já orienta decisões.

**Independent Test**: Selecionar um período com lançamentos conhecidos e verificar que entradas,
saídas e saldo batem com a soma dos lançamentos ativos daquele período no fuso da barbearia
(`America/Sao_Paulo` no MVP); que lançamentos inativos não entram; que um lançamento de borda (ex.:
22h no fuso local) cai no dia local correto; e que um período sem lançamentos exibe zeros.

**Acceptance Scenarios**:

1. **Given** um período com receitas e despesas ativas, **When** o OWNER abre o caixa desse período,
   **Then** vê o total de entradas, o total de saídas e o saldo igual a entradas − saídas.
2. **Given** um lançamento inativo dentro do período, **When** o caixa é calculado, **Then** esse
   lançamento NÃO é somado em entradas, saídas nem saldo.
3. **Given** um lançamento ocorrido às 22h no fuso `America/Sao_Paulo`, **When** o dia local é
   selecionado, **Then** ele conta nesse dia local (e não no dia UTC seguinte).
4. **Given** um período sem nenhum lançamento, **When** o OWNER o abre, **Then** entradas, saídas e
   saldo aparecem como zero, sem erro.
5. **Given** um período em que as saídas superam as entradas, **When** o saldo é exibido, **Then** o
   saldo é negativo (a feature não impede saldo negativo).
6. **Given** um período selecionado, **When** o OWNER navega para o anterior ou o próximo, **Then**
   os totais recalculam para o novo período mantendo a mesma granularidade (dia/semana/mês/ano).

---

### User Story 2 - OWNER vê o breakdown do período (Priority: P2)

Dentro do mesmo período da US1, o OWNER vê a composição dos totais: as **entradas quebradas por
forma de pagamento** (dinheiro, pix, cartão, online, outro e "não informado" para os sem forma) e
as **despesas quebradas por categoria** (incluindo "sem categoria" para as que não têm categoria).
A soma das partes bate exatamente com os totais da US1.

**Why this priority**: Enriquece o caixa (US1) explicando de onde vêm as entradas e para onde vão
as saídas. Depende dos totais existirem; agrega valor de gestão, mas o mínimo (US1) já entrega o
essencial.

**Independent Test**: Para um período com formas de pagamento e categorias variadas, verificar que a
soma das entradas por forma de pagamento é igual ao total de entradas da US1, que a soma das
despesas por categoria é igual ao total de saídas, e que lançamentos sem forma/sem categoria caem
nos baldes "não informado" / "sem categoria".

**Acceptance Scenarios**:

1. **Given** um período com receitas em várias formas de pagamento, **When** o breakdown é exibido,
   **Then** cada forma de pagamento mostra seu subtotal e a soma de todas as formas é igual ao total
   de entradas da US1.
2. **Given** receitas sem forma de pagamento informada, **When** o breakdown é exibido, **Then**
   elas aparecem no balde **"não informado"**, não são omitidas.
3. **Given** despesas com categorias variadas, **When** o breakdown é exibido, **Then** cada
   categoria mostra seu subtotal e a soma de todas as categorias é igual ao total de saídas da US1.
4. **Given** despesas sem categoria, **When** o breakdown é exibido, **Then** elas aparecem no balde
   **"sem categoria"**.
5. **Given** um lançamento inativo no período, **When** o breakdown é calculado, **Then** ele não
   entra em nenhum balde de forma de pagamento nem de categoria.

---

### User Story 3 - OWNER navega o razão de lançamentos (Priority: P2)

O OWNER percorre a listagem dos lançamentos da barbearia, **mais recentes primeiro**, com
**paginação por cursor** (página de 10, botão "carregar mais"; nunca por deslocamento/OFFSET).
Pode combinar filtros: **período**, **tipo** (receita/despesa), **origem** (agendamento/avulso/
despesa), **forma de pagamento** e **categoria**. Cada linha mostra o essencial — momento,
descrição, origem, forma de pagamento e valor com **sinal visual** dado pelo tipo — e pode ser
**expandida** para ver os itens do lançamento quando houver. Lançamentos **inativos não aparecem por
padrão**; um filtro explícito "mostrar inativos" os exibe **marcados como inativos** (para
auditoria), sem que contem em nenhum total.

**Why this priority**: Dá rastreabilidade linha a linha por trás dos totais (US1/US2) e é o palco da
inativação (US4). Depende dos lançamentos existirem; agrega auditabilidade, mas não é o número-
resumo mínimo.

**Independent Test**: Com um conjunto conhecido de lançamentos, verificar a ordem (mais recentes
primeiro), a paginação por cursor estável (sem itens repetidos nem pulados ao carregar mais), a
combinação de filtros, a expansão de itens, e que inativos só aparecem sob o filtro explícito e
sempre marcados como inativos.

**Acceptance Scenarios**:

1. **Given** mais de 10 lançamentos ativos, **When** o OWNER abre o razão, **Then** vê os 10 mais
   recentes e um controle "carregar mais" que traz os próximos 10 sem repetir nem pular linhas.
2. **Given** o razão aberto, **When** o OWNER aplica filtros combinados (ex.: período + tipo receita
   + forma pix), **Then** a listagem mostra apenas os lançamentos que satisfazem todos os filtros.
3. **Given** um lançamento de receita com itens, **When** o OWNER expande a linha, **Then** vê os
   itens (descrição e valor) daquele lançamento.
4. **Given** lançamentos inativos existentes, **When** nenhum filtro de inativos está ativo, **Then**
   eles NÃO aparecem na listagem.
5. **Given** o filtro "mostrar inativos" ativo, **When** a listagem é exibida, **Then** os
   lançamentos inativos aparecem visivelmente marcados como inativos e não são contados em nenhum
   total.
6. **Given** cada linha, **When** ela é exibida, **Then** o valor tem sinal visual coerente com o
   tipo (entrada vs. saída), sem depender de o número ser negativo.

---

### User Story 4 - OWNER inativa um lançamento a partir da listagem (Priority: P2)

Cada linha **ativa** do razão (US3) oferece a ação **"Inativar (corrigir)"**, que reutiliza a Server
Action e o núcleo de soft delete da F005 **sem alterações**. Depois de inativar, o caixa (US1), o
breakdown (US2) e a listagem (US3) refletem a mudança. Esta história **substitui a limitação da
F005**, em que só era possível inativar o último lançamento criado: agora qualquer lançamento ativo
pode ser inativado a partir da listagem.

**Why this priority**: Torna a correção utilizável no dia a dia (qualquer lançamento, não só o
último). Depende da listagem (US3) para escolher o alvo; é a única mutação da feature e reusa o core
existente, então é adição de superfície, não de regra.

**Independent Test**: A partir da listagem, inativar um lançamento que **não** é o último criado e
verificar que ele passa a inativo, some da listagem padrão, deixa de contar no caixa e no breakdown,
e continua consultável sob o filtro "mostrar inativos" — tudo pelo mesmo núcleo de soft delete da
F005, sem alteração dele.

**Acceptance Scenarios**:

1. **Given** um lançamento ativo que não é o último criado, **When** o OWNER usa "Inativar
   (corrigir)" na sua linha, **Then** o lançamento fica inativo reutilizando o soft delete da F005.
2. **Given** um lançamento recém-inativado, **When** o caixa e o breakdown do período são
   recalculados, **Then** ele deixa de contar em entradas, saídas, saldo e em qualquer balde.
3. **Given** um lançamento recém-inativado, **When** a listagem padrão é exibida, **Then** ele não
   aparece; sob "mostrar inativos", aparece marcado como inativo.
4. **Given** a inativação de um lançamento de origem agendamento, **When** ela ocorre, **Then** o
   agendamento correspondente permanece concluído (o soft delete não reabre o agendamento).

---

### User Story 5 - CLIENT vê o histórico dos próprios gastos (Priority: P3)

Qualquer usuário autenticado (independente do papel) vê a lista dos lançamentos de **receita** em
que **ele é o cliente** — isto é, os lançamentos cujo cliente é o próprio usuário da sessão. A F005
grava o cliente como o usuário do agendamento na conclusão, e como cliente opcional no walk-in
identificado. A lista vem **mais recente primeiro**, com a mesma paginação por cursor, e mostra
momento, descrição/itens e valor. **Não** mostra: despesas da barbearia, lançamentos de outros
clientes, walk-ins anônimos (sem cliente) e lançamentos inativos. O filtro por cliente = usuário da
sessão é aplicado **no servidor**; nenhum identificador de cliente é aceito da entrada.

**Why this priority**: Dá transparência ao cliente sobre o que gastou, fechando o ciclo do produto,
mas é secundário à visão de gestão do OWNER (US1–US4) e não bloqueia o balancete.

**Independent Test**: Autenticado como um cliente com lançamentos próprios, de outros clientes,
anônimos, despesas e inativos na base, verificar que a lista mostra **apenas** os lançamentos de
receita ativos em que ele é o cliente, mais recentes primeiro, e que forjar/alterar um identificador
de cliente na entrada não expõe lançamentos alheios (o filtro é sempre a sessão, no servidor).

**Acceptance Scenarios**:

1. **Given** um cliente autenticado com receitas próprias (de agendamento e de walk-in
   identificado), **When** ele abre o histórico, **Then** vê essas receitas, mais recentes primeiro,
   com momento, descrição/itens e valor.
2. **Given** lançamentos de outros clientes e walk-ins anônimos na base, **When** o cliente abre o
   histórico, **Then** nenhum deles aparece.
3. **Given** despesas da barbearia na base, **When** o cliente abre o histórico, **Then** nenhuma
   despesa aparece (o histórico do cliente é só de receitas em que ele é o cliente).
4. **Given** um lançamento próprio que foi inativado, **When** o cliente abre o histórico, **Then**
   ele não aparece.
5. **Given** uma tentativa de informar um identificador de cliente na entrada, **When** o histórico é
   consultado, **Then** o identificador da entrada é ignorado e o filtro usado é sempre o usuário da
   sessão (no servidor).

---

### Edge Cases

- **Período sem lançamentos**: caixa e breakdown exibem zeros em todos os campos e baldes; a
  listagem exibe vazio com estado tratado — nunca erro nem tela quebrada.
- **Borda de fuso (dia/semana/mês/ano)**: o pertencimento ao período é decidido pelo range em UTC
  `[início, fim)` derivado dos limites do período no fuso da barbearia (`America/Sao_Paulo` no MVP);
  um lançamento perto da meia-noite UTC pode pertencer ao dia local anterior/seguinte. O filtro é por
  range sobre `occurredAt` na consulta; a agregação não carrega lançamentos para bucketizar na
  aplicação.
- **Início da semana**: semana começa na **segunda-feira** (no fuso da barbearia; `America/Sao_Paulo`
  no MVP).
- **Saldo negativo**: permitido e exibido como negativo quando as saídas superam as entradas.
- **Soma das partes vs. total**: para o mesmo período e filtros, a soma dos baldes de breakdown é
  exatamente igual aos totais do caixa, e o saldo do caixa é igual a (soma das entradas − soma das
  saídas) da listagem correspondente. Somas em decimal exato, nunca ponto flutuante.
- **Lançamento inativo**: não conta em nenhum total ou balde, em nenhuma tela; aparece só na
  listagem do OWNER sob filtro explícito, marcado como inativo.
- **Forma de pagamento ausente**: receita sem forma cai no balde "não informado" no breakdown;
  filtrar por "não informado" traz exatamente essas.
- **Categoria ausente**: despesa sem categoria cai no balde "sem categoria"; a agregação por
  categoria usa o texto livre como está (sem padronização/normalização nesta feature).
- **Paginação estável sob empate de momento**: dois lançamentos com o mesmo momento são ordenados de
  forma determinística por um desempate estável, de modo que "carregar mais" nunca repete nem pula
  linhas.
- **Walk-in anônimo no histórico do cliente**: lançamento sem cliente (anônimo) nunca aparece para
  ninguém no histórico do cliente.
- **Inativação concorrente**: inativar um lançamento já inativo (ex.: duas abas) é tratado pela
  recusa existente do núcleo de soft delete da F005, sem efeito duplicado.
- **Filtros combinados sem resultado**: uma combinação de filtros que não casa com nenhum lançamento
  retorna listagem vazia tratada, não erro.

## Clarifications

### Session 2026-07-02

- Q: O fuso usado na bucketização de períodos e na exibição é o literal `America/Sao_Paulo`
  hardcoded ou uma fonte configurável? → A: É o **campo `timezone` da barbearia**
  (`Barbershop.timezone`, default `America/Sao_Paulo`), a mesma fonte que o domínio de
  disponibilidade da F001 já usa; a regra referencia o campo, não a string. No MVP de barbearia
  única o valor efetivo é `America/Sao_Paulo`.
- Q: FR-003 exige a conversão de fuso dentro da consulta (`AT TIME ZONE`/`date_trunc`) ou basta não
  bucketizar carregando linhas na aplicação? → A: A exigência real é **não** carregar lançamentos
  para agregar/bucketizar na aplicação (pós-processamento). Deriva-se o range em UTC `[início, fim)`
  no fuso da barbearia (camada de domínio/Luxon) e filtra-se por **range puro sobre `occurredAt`** na
  consulta — isso preserva o índice `(barbershopId, occurredAt)` e dispensa `AT TIME ZONE`/
  `date_trunc` para período único.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST apresentar ao OWNER, para um período selecionado, o **total de
  entradas** (soma dos lançamentos de receita ativos), o **total de saídas** (soma dos lançamentos
  de despesa ativos) e o **saldo** = entradas − saídas.
- **FR-002**: O sistema MUST suportar as granularidades de período **dia, semana, mês e ano** e
  permitir navegar para o período **anterior** e o **próximo** mantendo a granularidade atual.
- **FR-003**: Todos os limites de período MUST ser calculados no **fuso da barbearia** (campo
  `timezone`; `America/Sao_Paulo` no MVP de barbearia única — a mesma fonte usada pelo domínio de
  disponibilidade da F001), NÃO um fuso hardcoded, sobre o momento do lançamento (armazenado em
  UTC); a **semana** MUST começar na **segunda-feira**. A bucketização MUST ocorrer via range em UTC
  `[início, fim)` derivado no fuso da barbearia, aplicado como filtro na consulta; o sistema NÃO MUST
  carregar lançamentos para agregar ou bucketizar na aplicação.
- **FR-004**: Apenas lançamentos **ativos** MUST contar em qualquer total, saldo ou balde de
  breakdown; lançamentos inativos NÃO MUST ser somados em nenhuma tela.
- **FR-005**: Um período **sem lançamentos** MUST exibir zeros em entradas, saídas, saldo e baldes,
  sem erro nem tela vazia quebrada.
- **FR-006**: O **saldo** MUST poder ser **negativo** quando as saídas superarem as entradas; o
  sistema NÃO MUST impedir nem esconder saldo negativo.
- **FR-007**: O sistema MUST apresentar, para o mesmo período, o **breakdown das entradas por forma
  de pagamento** — dinheiro, pix, cartão, online, outro e um balde **"não informado"** para receitas
  sem forma de pagamento.
- **FR-008**: O sistema MUST apresentar, para o mesmo período, o **breakdown das despesas por
  categoria**, incluindo um balde **"sem categoria"** para despesas sem categoria; a agregação MUST
  usar o texto da categoria **como está** (sem padronização/lista fechada).
- **FR-009**: A soma dos baldes de cada breakdown MUST ser exatamente igual ao total correspondente
  do caixa (entradas por forma = total de entradas; despesas por categoria = total de saídas).
- **FR-010**: O sistema MUST listar ao OWNER os lançamentos da barbearia **mais recentes primeiro**,
  com **paginação por cursor** (keyset), página de **10**, via controle "carregar mais"; NÃO MUST
  usar paginação por deslocamento/OFFSET.
- **FR-011**: A paginação MUST ser **estável**: o cursor MUST usar o momento do lançamento com um
  **desempate determinístico** por identificador, de modo que "carregar mais" nunca repita nem pule
  lançamentos, mesmo com momentos iguais.
- **FR-012**: A listagem do OWNER MUST oferecer filtros **combináveis**: período, tipo (receita/
  despesa), origem (agendamento/avulso/despesa), forma de pagamento e categoria; múltiplos filtros
  MUST ser aplicados em conjunção (todos precisam casar).
- **FR-013**: Cada linha da listagem MUST exibir, no mínimo, o **momento**, a **descrição**, a
  **origem**, a **forma de pagamento** e o **valor** com **sinal visual** derivado do **tipo**
  (entrada/saída); o sinal NÃO MUST depender de o valor armazenado ser negativo.
- **FR-014**: Cada linha de lançamento com itens MUST poder ser **expandida** para exibir os itens
  (descrição e valor) daquele lançamento.
- **FR-015**: Lançamentos **inativos** NÃO MUST aparecer na listagem por padrão; um filtro explícito
  **"mostrar inativos"** MUST exibi-los **marcados como inativos** (auditoria), sem contá-los em
  nenhum total.
- **FR-016**: A listagem do OWNER MUST oferecer, em cada linha **ativa**, a ação **"Inativar
  (corrigir)"**, que MUST reutilizar a Server Action e o núcleo de soft delete da F005 **sem
  alterações** (nenhum novo caminho de escrita é criado).
- **FR-017**: A inativação a partir da listagem MUST permitir inativar **qualquer** lançamento ativo
  (não apenas o último criado), substituindo a limitação da F005; após a inativação, caixa,
  breakdown e listagem MUST refletir a mudança.
- **FR-018**: Inativar um lançamento de origem agendamento NÃO MUST reabrir/desconcluir o
  agendamento correspondente (comportamento herdado do núcleo da F005).
- **FR-019**: O sistema MUST apresentar ao **usuário autenticado** (qualquer papel) o **histórico
  dos próprios gastos**: os lançamentos de **receita ativos** em que o **cliente** é o próprio
  usuário da sessão, mais recentes primeiro, com a mesma paginação por cursor.
- **FR-020**: O histórico do cliente MUST exibir, por lançamento, o **momento**, a **descrição/
  itens** e o **valor**; e NÃO MUST exibir despesas da barbearia, lançamentos de outros clientes,
  walk-ins anônimos (sem cliente) nem lançamentos inativos.
- **FR-021**: O filtro "cliente = usuário da sessão" MUST ser aplicado **no servidor**; nenhum
  identificador de cliente MUST ser aceito da entrada (a mesma disciplina de propriedade da F004 —
  o identificador nunca vem do input).
- **FR-022**: Caixa, breakdown, listagem do razão e inativação MUST ser exclusivos do **OWNER**,
  verificados no servidor pelo guard de papel existente (F002); um não-OWNER NÃO MUST acessar essas
  visões nem inativar lançamentos.
- **FR-023**: Todas as somas monetárias MUST preservar **precisão decimal** (valores em duas casas,
  nunca ponto flutuante); os resultados MUST ser exatos.
- **FR-024**: Para o mesmo período e filtros, o **saldo** exibido no caixa MUST ser igual a (soma das
  entradas − soma das saídas) da listagem correspondente (consistência interna entre visões).
- **FR-025**: Esta feature MUST ser de **leitura pura**: NÃO MUST criar nenhuma entidade nova,
  nenhuma migração de schema nem nenhum novo caminho de escrita; a única mutação disponível MUST
  continuar sendo o soft delete da F005 (FR-016).
- **FR-026**: Esta feature NÃO MUST incluir gráficos/visualizações, exportação (CSV/PDF),
  comparativos entre períodos, metas/projeções, edição de lançamento, estorno, gateway de pagamento
  nem status de pagamento (pendente/realizado) — números e tabelas apenas (fora de escopo).

### Key Entities *(include if feature involves data)*

- **Lançamento (LedgerEntry)**: reutilizado da F005 sem alteração de schema. É a unidade agregada e
  listada. Atributos relevantes para leitura: **tipo** (receita/despesa) — define o sinal;
  **origem** (agendamento/avulso/despesa) — filtro e exibição; **valor** (positivo, decimal duas
  casas); **momento** (instante em UTC, interpretado no fuso da barbearia para bucketização);
  **forma de pagamento** (opcional — balde "não informado" quando ausente); **categoria** (opcional,
  texto livre — balde "sem categoria" quando ausente, usada só em despesas); **cliente** (opcional —
  base do histórico do cliente); **estado ativo/inativo** (soft delete — inativos fora dos totais).
- **Item de Lançamento (LedgerEntryItem)**: reutilizado da F005. Exibido na **expansão** de uma
  linha de receita; atributos lidos: descrição e valor. Não participa das agregações de caixa (o
  total já está no lançamento).
- **Período (conceito de leitura)**: uma janela de tempo (dia/semana/mês/ano) no fuso da barbearia
  (campo `timezone`; `America/Sao_Paulo` no MVP), com início e fim, usada para filtrar e agregar
  lançamentos pelo seu momento.
  Não é uma entidade persistida.
- **Cliente (Client/User)**: reutilizado do cadastro existente. Determina o histórico do cliente
  (lançamentos de receita em que ele é o cliente). O identificador vem sempre da sessão, nunca da
  entrada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para 100% dos períodos selecionados, entradas, saídas e saldo exibidos correspondem
  exatamente à soma dos lançamentos **ativos** daquele período no fuso da barbearia
  (`America/Sao_Paulo` no MVP), com saldo = entradas − saídas.
- **SC-002**: 100% dos lançamentos **inativos** são excluídos de todos os totais, saldos e baldes de
  breakdown, em todas as telas.
- **SC-003**: 100% dos lançamentos de borda de fuso são atribuídos ao dia/semana/mês/ano correto no
  **fuso da barbearia** (`America/Sao_Paulo` no MVP), incluindo casos próximos da meia-noite UTC.
- **SC-004**: Para 100% dos períodos, a soma dos baldes de breakdown é **exatamente igual** ao total
  correspondente do caixa (entradas por forma = total de entradas; despesas por categoria = total de
  saídas), e o saldo do caixa é igual a (entradas − saídas) da listagem correspondente.
- **SC-005**: 100% dos períodos sem lançamentos exibem zeros (sem erro nem tela quebrada).
- **SC-006**: A listagem do OWNER retorna os lançamentos **mais recentes primeiro** em 100% dos
  casos, e a paginação por cursor não repete nem pula nenhuma linha ao "carregar mais", inclusive
  quando há lançamentos com o mesmo momento.
- **SC-007**: 100% das combinações de filtros retornam apenas os lançamentos que satisfazem **todos**
  os filtros aplicados.
- **SC-008**: Lançamentos inativos aparecem em 0% das listagens sem o filtro explícito e em 100% das
  listagens com "mostrar inativos" ativo, sempre marcados como inativos e nunca contados em totais.
- **SC-009**: 100% das inativações feitas a partir da listagem funcionam para **qualquer** lançamento
  ativo (não só o último), reutilizando o núcleo de soft delete da F005 sem alteração; após inativar,
  caixa, breakdown e listagem refletem a mudança e o agendamento de origem (quando houver) permanece
  concluído.
- **SC-010**: No histórico do cliente, 100% dos itens exibidos são lançamentos de **receita ativos**
  em que o usuário da sessão é o cliente; 0% são despesas, lançamentos de outros clientes, walk-ins
  anônimos ou inativos.
- **SC-011**: 100% das tentativas de acesso do não-OWNER ao caixa, breakdown, razão ou inativação são
  recusadas no servidor; 100% das consultas de histórico do cliente usam o identificador da **sessão**
  (0% aceitam identificador da entrada).
- **SC-012**: 100% das somas monetárias são exatas em duas casas decimais (0% de erro de ponto
  flutuante).

## Assumptions

- A feature é **somente leitura** sobre o modelo da F005: reutiliza `LedgerEntry`, `LedgerEntryItem`,
  os enums de tipo/origem/forma de pagamento e o índice existente por barbearia + momento; **não**
  cria entidade, migração nem caminho de escrita. A única mutação é o soft delete da F005
  (`deactivate-ledger-entry`), reutilizado sem alteração — a limitação de "inativar só o último"
  era da superfície de UI, não do núcleo, então nenhuma mudança de núcleo é necessária.
- **MVP de barbearia única**: as agregações do OWNER são sobre a barbearia do sistema (mesmo
  pressuposto da F005). Multi-barbearia está fora de escopo.
- **Granularidade e período padrão ao abrir**: assume-se **mês corrente** como visão inicial do caixa
  quando o OWNER abre a tela, com navegação anterior/próximo e troca de granularidade. É um padrão de
  conveniência; qualquer granularidade suportada pode ser selecionada.
- **Listagem do razão sem filtro de período**: por padrão a listagem do OWNER mostra todos os
  lançamentos ativos (mais recentes primeiro); o filtro de período é opcional e combinável com os
  demais.
- **Desempate da paginação**: o cursor usa (momento, identificador do lançamento) com ordenação
  determinística; o identificador serve de desempate estável para momentos iguais, aproveitando o
  índice existente por barbearia + momento.
- **Momento exibido**: datas/horas são apresentadas no fuso da barbearia (campo `timezone`;
  `America/Sao_Paulo` no MVP), coerentes com a bucketização por período (armazenamento em UTC,
  apresentação/lógica no fuso da barbearia).
- **Autorização**: caixa, breakdown, razão e inativação usam o guard de papel `requireOwner` (F002);
  o histórico do cliente exige apenas usuário autenticado e filtra por cliente = sessão no servidor
  (disciplina de propriedade da F004 — identificador nunca vem do input).
- **Categorias**: texto livre herdado da F005; a agregação por categoria não normaliza nem impõe
  lista fechada — trata cada texto distinto como um balde e agrupa as ausentes em "sem categoria".
- **Fora de escopo (F006)**: gráficos/visualizações, exportação (CSV/PDF), comparativos entre
  períodos, metas/projeções, qualquer novo caminho de escrita (edição de lançamento, estorno),
  gateway de pagamento e status de pagamento (pendente/realizado). A feature entrega números e
  tabelas apenas.
