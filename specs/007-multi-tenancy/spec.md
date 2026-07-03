# Feature Specification: Multi-tenancy — Negócios, Donos e Administração

**Feature Branch**: `007-multi-tenancy`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Multi-tenancy — negócios, donos e administração (F007). Transformar o Trimote de instalação de barbearia única em plataforma multi-tenant: N negócios na mesma infra, cada um com serviços/agenda/financeiro/página própria (slug), donos vinculados ao seu negócio, e uma conta ADMIN que cria negócios e promove donos. Renomeação genérica Barbershop→Business, BarbershopService→Service em migration própria antes da funcional. É a feature que permite fechar a segunda parceria."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - ADMIN cria um negócio e promove o dono (Priority: P1)

O **ADMIN** (operador da plataforma, papel novo distinto de dono) acessa uma **área administrativa
restrita** e: (a) cria um **negócio** (nome, **slug único**, fuso, segmento); (b) busca um usuário
**já cadastrado** pelo email (a pessoa já criou a conta normal via login) e o **vincula como dono**
(OWNER) daquele negócio. Cada criação e cada promoção são **auditáveis** (quem fez, quando). **Não há
self-service**: nenhum usuário se torna dono ou ADMIN por conta própria.

**Why this priority**: É o que destrava a **segunda parceria** — sem criar negócio e promover dono,
a plataforma continua de instalação única. É a porta de entrada de todo o resto.

**Independent Test**: Autenticado como ADMIN, criar um negócio com slug único, buscar um usuário por
email e promovê-lo a dono; verificar que o negócio existe, o vínculo foi criado com autor+momento, e
que um não-ADMIN é recusado no servidor ao tentar as mesmas ações.

**Acceptance Scenarios**:

1. **Given** um ADMIN autenticado, **When** ele cria um negócio (nome, slug único, fuso, segmento),
   **Then** o negócio é criado e o autor/momento ficam registrados.
2. **Given** um ADMIN e um usuário existente (pelo email), **When** o ADMIN o vincula como dono de um
   negócio, **Then** o vínculo dono↔negócio é criado com registro de quem promoveu e quando.
3. **Given** um email que não corresponde a nenhum usuário cadastrado, **When** o ADMIN tenta
   promover, **Then** a ação é recusada com aviso claro (a pessoa precisa ter criado a conta antes).
4. **Given** um usuário **não-ADMIN** (dono ou cliente), **When** ele tenta acessar a área
   administrativa ou chamar as operações de criação/promoção, **Then** é **recusado no servidor**.
5. **Given** um negócio e um dono já vinculado, **When** o ADMIN tenta vincular o mesmo dono ao mesmo
   negócio de novo, **Then** a ação é recusada (vínculo duplicado) sem criar registro repetido.

---

### User Story 2 - Dono com mais de um negócio (Priority: P2)

O vínculo dono↔negócio é **N:N**: um usuário pode ser dono de **vários** negócios e um negócio pode
ter **vários** donos. Quando o usuário tem **mais de um** negócio, as áreas de dono (painel de
serviços, financeiro/ledger, caixa) oferecem um **seletor de negócio ativo**; com apenas um, o
seletor é dispensável (o único negócio é o ativo). O papel do vínculo aceita **dono** hoje e está
**preparado para colaborador (STAFF)** no futuro — apenas a fundação, sem funcionalidade de STAFF
nesta feature.

**Why this priority**: Sustenta o crescimento (um dono operando duas casas) e é a base do modelo N:N.
Depende da fundação da US1; agrega, mas o mínimo (um dono, um negócio) já entrega valor.

**Independent Test**: Vincular o mesmo usuário como dono de dois negócios; ao acessar as áreas de
dono, verificar que existe um seletor de negócio ativo e que cada visão (serviços, caixa, razão)
mostra **apenas** os dados do negócio selecionado.

**Acceptance Scenarios**:

1. **Given** um dono vinculado a dois negócios, **When** ele abre uma área de dono, **Then** vê um
   seletor de negócio ativo e a visão reflete o negócio selecionado.
2. **Given** um dono vinculado a apenas um negócio, **When** ele abre uma área de dono, **Then** a
   visão é a desse negócio sem exigir seleção.
3. **Given** um negócio com dois donos, **When** cada um acessa suas áreas, **Then** ambos veem e
   operam o mesmo negócio.
4. **Given** a fundação de papéis do vínculo, **When** o modelo é inspecionado, **Then** o papel
   aceita "dono" e comporta um papel futuro de colaborador, sem que qualquer função de colaborador
   esteja ativa nesta feature.

---

### User Story 3 - Escopo por negócio em TODAS as superfícies do dono (Priority: P1)

Todas as operações de dono passam a ser **escopadas pelo negócio ativo do vínculo**: painel de
serviços/horários, conclusão e registro financeiro, e caixa/breakdown/razão. O **identificador do
negócio NUNCA vem da entrada** — é derivado do vínculo do usuário da sessão, no servidor. Um dono do
negócio **A jamais lê ou escreve** dados do negócio **B** (mesma disciplina anti-IDOR do
identificador de cliente já existente). As resoluções de "a (única) barbearia" desaparecem.

**Why this priority**: É a **barreira de isolamento** da multi-tenancy. Sem ela, um dono veria/mexeria
no dinheiro e na agenda de outro — falha de segurança inaceitável. É condição para abrir o segundo
negócio com segurança.

**Independent Test**: Com dois negócios e dois donos distintos, tentar (como dono de A) ler o caixa,
listar serviços, concluir um atendimento e inativar um lançamento de **B**, informando ou não o
identificador de B na entrada; verificar que **todas** as tentativas são recusadas no servidor e que
cada dono só enxerga o seu negócio.

**Acceptance Scenarios**:

1. **Given** um dono do negócio A, **When** ele abre o painel de serviços, o financeiro e o caixa,
   **Then** vê **apenas** dados de A.
2. **Given** um dono do negócio A que tenta operar sobre um recurso de B (por manipulação da entrada
   ou do identificador), **When** a operação é processada, **Then** é **recusada no servidor** — o
   negócio é derivado do vínculo, não da entrada.
3. **Given** qualquer operação de escrita de dono (criar serviço, concluir atendimento, registrar
   avulso/despesa, inativar lançamento), **When** ela é executada, **Then** afeta somente o negócio
   ativo do vínculo do autor.
4. **Given** as agregações financeiras (caixa/breakdown/razão), **When** são calculadas, **Then**
   somam **apenas** os lançamentos do negócio ativo.

---

### User Story 4 - Página pública por slug (Priority: P2)

Cada negócio tem uma **página pública própria** em `/b/[slug]` — a porta de entrada do cliente (QR
code impresso, link no Instagram). A partir dela o cliente vê os **serviços daquele negócio** e
**agenda nele**. O fluxo de agendamento, "meus agendamentos" e o histórico de gastos continuam
funcionando, agora **cientes de negócio**: agendar acontece sempre no contexto de um negócio. **Slug
inválido → 404 tratado**.

**Why this priority**: É como o cliente chega ao negócio novo — sem ela, não há como o segundo negócio
receber clientes. Depende do negócio existir (US1); é a superfície pública mínima.

**Independent Test**: Acessar `/b/[slug]` de um negócio, ver os serviços daquele negócio, agendar um
horário e confirmar que o agendamento nasce vinculado a esse negócio; acessar um slug inexistente e
obter 404 tratado.

**Acceptance Scenarios**:

1. **Given** um negócio com slug válido, **When** um cliente acessa `/b/[slug]`, **Then** vê os
   serviços **daquele** negócio e pode agendar nele.
2. **Given** um agendamento feito a partir de `/b/[slug]`, **When** ele é criado, **Then** nasce
   **vinculado ao negócio** do slug.
3. **Given** um slug que não corresponde a nenhum negócio, **When** acessado, **Then** retorna **404
   tratado** (sem erro cru).
4. **Given** a agenda de um negócio, **When** a disponibilidade é calculada, **Then** a
   não-sobreposição continua **por negócio** (agendamentos de A não bloqueiam horários de B).

---

### User Story 5 - Cliente global (Priority: P3)

A conta do cliente é **única na plataforma**: o mesmo usuário agenda em **qualquer** negócio, e
"meus agendamentos" e "meus gastos" **agregam tudo**, identificando **de qual negócio** é cada item.
Não há isolamento de cliente por negócio (o cliente não precisa de conta por barbearia).

**Why this priority**: Melhora a experiência do cliente que frequenta mais de um negócio, mas é
secundária ao que destrava a parceria (US1/US3/US4); as listagens já existem e só precisam rotular o
negócio.

**Independent Test**: Com um cliente que agendou em dois negócios, verificar que "meus agendamentos" e
"meus gastos" mostram itens dos **dois**, cada item identificando seu negócio, sem exigir contas
separadas.

**Acceptance Scenarios**:

1. **Given** um cliente que agendou em dois negócios, **When** ele abre "meus agendamentos", **Then**
   vê os agendamentos dos dois, cada um identificando o negócio.
2. **Given** um cliente com receitas em dois negócios, **When** ele abre "meus gastos", **Then** vê o
   histórico agregado, cada item identificando o negócio.
3. **Given** a mesma conta de cliente, **When** ela agenda em negócios diferentes, **Then** nenhum
   cadastro adicional é exigido (conta única).

---

### User Story 6 - Migração da instalação existente (Priority: P1)

A migração funcional faz **backfill** sem perda: o negócio existente (a barbearia atual) **permanece
como o primeiro negócio** (vira o demo/showroom), **ganha um slug**, e o dono atual ganha o **vínculo
dono↔negócio** correspondente. A conta do **operador** é promovida a **ADMIN** por
**seed/script documentado** (bootstrap do primeiro ADMIN é manual; a partir dele, tudo via US1).
**Nenhum dado existente** (agendamentos, lançamentos, serviços) é perdido nem re-associado ao negócio
errado.

**Why this priority**: Sem uma migração correta, tudo o que já existe quebra ou vaza. É pré-condição
para a plataforma funcionar em cima da base atual.

**Independent Test**: Rodar as migrações sobre a base existente e verificar que: o negócio atual
segue existente com slug; o dono atual tem vínculo dono↔negócio; o operador é ADMIN; e a contagem e
o vínculo de agendamentos/lançamentos/serviços permanecem **idênticos** ao estado anterior (nada
perdido nem re-associado).

**Acceptance Scenarios**:

1. **Given** a base atual (um negócio, seus serviços, agendamentos e lançamentos), **When** a
   migração funcional roda, **Then** o negócio existente permanece, com slug, e todos os dados
   continuam vinculados a ele.
2. **Given** o dono atual, **When** a migração roda, **Then** ele passa a ter o vínculo dono↔negócio
   do negócio existente (sem perder acesso).
3. **Given** a conta do operador da plataforma, **When** o bootstrap documentado roda, **Then** ela
   vira ADMIN — e essa é a **única** promoção a ADMIN feita fora da própria plataforma.
4. **Given** a suíte de testes das features anteriores, **When** as migrações (rename + funcional)
   são aplicadas, **Then** **todos** os testes existentes continuam verdes.

---

### Edge Cases

- **Rename preserva a não-sobreposição**: a migração de rename troca o nome da coluna que particiona a
  restrição de exclusão de agendamentos; a restrição DEVE continuar válida e **por negócio** após o
  rename (nada de perder a garantia de não-sobreposição).
- **Slug duplicado**: criar um negócio com slug já usado é recusado; o slug é único na plataforma.
- **Slug malformado**: valor fora do formato URL-safe (`^[a-z0-9]+(-[a-z0-9]+)*$`) é recusado na criação.
- **Slug reservado**: um slug que colide com rota do app (admin, api, b, booking, owner, login, …) é
  recusado na criação (não pode virar página de negócio).
- **Promover email inexistente**: recusado (a pessoa precisa ter conta antes; sem criação implícita).
- **Vínculo duplicado**: promover o mesmo dono ao mesmo negócio duas vezes é idempotente/recusado, sem
  duplicar o registro.
- **Dono sem nenhum negócio** (promovido e depois removido): as telas de dono mostram **estado vazio**
  orientando contato com o ADMIN, **sem erro** (não há negócio ativo a derivar).
- **Trocar de negócio ativo**: quando o dono tem vários, alternar o negócio ativo troca **toda** a
  visão (serviços, caixa, razão) para o negócio selecionado, sem vazar o anterior.
- **ADMIN que não é dono**: um ADMIN sem vínculo a negócio **não** opera negócios (não conclui
  atendimento, não vê caixa de terceiros); administra a plataforma. Se também for membro de um
  negócio, opera esse negócio como qualquer dono.
- **Remarcar/cancelar entre negócios**: remarcar mantém o agendamento **no mesmo negócio** (não se
  move um agendamento de A para B).
- **Cliente em `/b/[slug]` de negócio sem serviços**: a página trata o caso (lista vazia), sem erro.
- **Identificador de negócio na entrada de operação de dono**: sempre ignorado; o negócio vem do
  vínculo da sessão (anti-IDOR).

## Clarifications

### Session 2026-07-03

- Q: No MVP, o que o dono pode editar via UI própria do seu negócio (auditando a assumption de
  autogestão)? → A: **Confirmada** (a assumption já coincidia): o dono edita os **horários de
  funcionamento (OpeningHours)** e gerencia o **catálogo de serviços** (F002), sempre escopados ao
  negócio ativo, além de operar o financeiro. NÃO edita a **identidade do negócio** — **nome, slug,
  fuso (timezone) e segmento** são exclusivos do ADMIN.
- Q: Como o "negócio ativo" do seletor (US2) é representado e derivado? → A: É **estado de sessão no
  servidor**, NÃO parâmetro de request. O dono com N negócios escolhe no seletor e a escolha
  **persiste** (sessão/cookie server-side); **toda** operação de dono deriva o `businessId` desse
  estado e **revalida o vínculo** (é membro OWNER daquele negócio?) a cada request. 1 negócio →
  auto-selecionado, seletor oculto; 0 negócios → telas de dono mostram **estado vazio** orientando
  contato com o ADMIN, sem erro. `businessId` como parâmetro de request seria a porta de IDOR que a
  US3/FR-014 proíbem.
- Q: Como o slug é definido na criação do negócio (US1)? → A: O ADMIN informa o slug no formulário,
  **pré-preenchido por derivação do nome** (kebab-case, sem acentos) e **editável** antes de salvar.
  Validação **no servidor**: formato URL-safe `^[a-z0-9]+(-[a-z0-9]+)*$`, **unicidade** e **lista de
  slugs reservados** (ex.: admin, api, b, booking, owner, login — rotas do app não podem virar slug).
  Após criado, imutável pela UI (FR-023).

## Requirements *(mandatory)*

### Functional Requirements

**Fundação / renomeação (migração em duas etapas)**

- **FR-001**: A generalização de nomes (negócio e serviço) DEVE ser feita em uma **migração própria e
  separada** de **rename puro**, sem qualquer mudança de lógica ou de dados, aplicada **antes** da
  migração funcional.
- **FR-002**: O rename DEVE **preservar** a restrição de não-sobreposição de agendamentos e sua
  natureza **por negócio**; após o rename, agendamentos de um negócio NÃO DEVEM bloquear horários de
  outro, e a garantia de não-sobreposição no nível de dados permanece.
- **FR-003**: A entidade de negócio DEVE ganhar um campo de **segmento** com valor padrão
  correspondente a "barbearia"; o sistema NÃO DEVE, nesta feature, ramificar comportamento por
  segmento (multi-vertical real está fora de escopo).

**Administração da plataforma (ADMIN)**

- **FR-004**: O sistema DEVE ter um papel de **ADMIN** (operador da plataforma), distinto do papel de
  dono; a verificação de ADMIN DEVE ocorrer **no servidor** por um guard próprio.
- **FR-005**: Apenas ADMIN DEVE poder **criar negócios** e **promover donos**; qualquer não-ADMIN DEVE
  ser recusado no servidor nessas operações.
- **FR-006**: NÃO DEVE existir **self-service** de elevação de privilégio: nenhum usuário consegue se
  tornar dono ou ADMIN por conta própria; toda promoção passa pelo ADMIN (exceto o bootstrap do
  primeiro ADMIN, FR-020).
- **FR-007**: O ADMIN DEVE poder **criar um negócio** informando nome, **slug único**, fuso e
  segmento; o negócio criado registra **autor e momento** da criação (auditoria). O campo de slug no
  formulário DEVE vir **pré-preenchido** por derivação automática do nome (kebab-case, sem acentos) e
  ser **editável** antes de salvar.
- **FR-008**: O ADMIN DEVE poder **buscar um usuário existente pelo email** e **vinculá-lo como dono**
  de um negócio; promover um email sem usuário correspondente DEVE ser recusado.
- **FR-009**: Toda **promoção de dono** DEVE registrar **quem promoveu e quando** (auditoria mínima).
- **FR-010**: ADMIN NÃO DEVE ser dono global: administrar a plataforma NÃO concede acesso operacional
  aos negócios (concluir atendimento, ver caixa) — isso exige vínculo de dono ao negócio. Um ADMIN que
  também seja dono opera apenas os negócios em que é membro.

**Vínculo dono↔negócio (membros)**

- **FR-011**: O vínculo dono↔negócio DEVE ser **N:N** (um usuário pode ser dono de vários negócios; um
  negócio pode ter vários donos), com **papel** que aceita "dono" hoje e comporta um papel futuro de
  **colaborador (STAFF)** — sem qualquer funcionalidade de STAFF nesta feature.
- **FR-012**: Cada vínculo DEVE ser **único** por (usuário, negócio); tentativa de vínculo duplicado
  DEVE ser recusada/idempotente, sem registro repetido.
- **FR-013**: "Ser dono" (o guard de dono) DEVE passar a significar **"ser membro dono do negócio
  ativo"**, verificado no servidor a partir do vínculo do usuário da sessão.

**Escopo por negócio (anti-IDOR)**

- **FR-014**: Em **todas** as operações de dono (serviços/horários, conclusão e registro financeiro,
  caixa/breakdown/razão, inativação), o **identificador do negócio** DEVE ser **derivado do vínculo do
  usuário da sessão** e **NUNCA** aceito da entrada.
- **FR-015**: Um dono NÃO DEVE conseguir **ler nem escrever** dados de um negócio do qual não é
  membro; a barreira DEVE ser verificada **no servidor** (visibilidade de UI é conveniência, não
  barreira).
- **FR-016**: As agregações financeiras (caixa/breakdown/razão) e as listagens de dono DEVEM somar/
  listar **apenas** os dados do **negócio ativo**; nenhum dado de outro negócio entra em total, saldo,
  balde ou lista.
- **FR-017**: O sistema NÃO DEVE mais resolver "a (única) barbearia" implicitamente; toda operação de
  dono DEVE ser explicitamente escopada pelo negócio ativo do vínculo.
- **FR-018**: Quando o dono tem **mais de um** negócio, as áreas de dono DEVEM oferecer um **seletor de
  negócio ativo**; com apenas um negócio, o único é o ativo sem exigir seleção. A troca de negócio
  ativo DEVE trocar **toda** a visão de dono, sem vazar dados do negócio anterior.

**Página pública e cliente**

- **FR-019**: Cada negócio DEVE ter uma **página pública** acessível por **slug** (`/b/[slug]`) que
  lista os **serviços daquele negócio** e permite **agendar nele**; um slug inexistente DEVE retornar
  **404 tratado**.
- **FR-020**: Agendar a partir da página pública DEVE criar o agendamento **vinculado ao negócio** do
  slug; o fluxo de agendamento, remarcação, cancelamento e disponibilidade DEVE operar **por
  negócio**, preservando a não-sobreposição por negócio.
- **FR-021**: A conta do cliente DEVE ser **única na plataforma**; o mesmo cliente agenda em qualquer
  negócio sem cadastro adicional. As listagens do cliente ("meus agendamentos", "meus gastos") DEVEM
  **agregar** itens de todos os negócios, **identificando o negócio** de cada item.

**Slug, auditoria, migração e regressão**

- **FR-022**: O **primeiro ADMIN** DEVE ser criado por **bootstrap manual documentado** (seed/script);
  a partir dele, toda administração ocorre pela própria plataforma (FR-005..FR-009).
- **FR-023**: O **slug** DEVE ser validado **no servidor**: **formato URL-safe**
  (`^[a-z0-9]+(-[a-z0-9]+)*$`), **único** na plataforma, e **fora da lista de slugs reservados** (as
  rotas do app — ex.: admin, api, b, booking, owner, login — NÃO podem virar slug). O slug DEVE ser
  **imutável pela UI** no MVP (mudar slug quebraria QR codes impressos); qualquer alteração é decisão
  futura fora desta feature.
- **FR-024**: A migração funcional DEVE fazer **backfill** preservando 100% dos dados: o negócio
  existente permanece (com slug), o dono atual recebe seu vínculo dono↔negócio, e agendamentos/
  lançamentos/serviços seguem vinculados **ao mesmo negócio** (nada perdido nem re-associado).
- **FR-025**: Após ambas as migrações (rename + funcional), **todos os testes existentes das features
  anteriores DEVEM continuar verdes** — regressão completa é critério de aceite.
- **FR-026**: Esta feature NÃO DEVE incluir: agenda por profissional/escolha de barbeiro (só a
  fundação do papel STAFF), personalização visual da página do negócio, marketplace/listagem pública
  de negócios, autogestão de identidade do negócio pelo dono, nem cobrança/planos da plataforma.

### Key Entities *(include if feature involves data)*

- **Negócio (Business — renomeado de Barbershop)**: um tenant da plataforma. Atributos: nome, **slug**
  (único, URL-safe, imutável no MVP), **fuso**, **segmento** (padrão "barbearia"), autor/momento de
  criação (auditoria). Possui serviços, horários, agendamentos e lançamentos próprios. A
  não-sobreposição de agendamentos é **por negócio**.
- **Serviço (Service — renomeado de BarbershopService)**: pertence a um negócio; preço/duração como
  hoje. Reusa a lógica da F002/F005; agora explicitamente escopado por negócio.
- **Membro do negócio (BusinessMember)**: vínculo **N:N** entre usuário e negócio, com **papel**
  ("dono" hoje; comporta "colaborador/STAFF" futuro), **único** por (usuário, negócio), e registro de
  **quem vinculou e quando**. É a fonte de verdade de "quem é dono de qual negócio".
- **Usuário (User)**: conta **única** na plataforma. Ganha a noção de **ADMIN** (operador da
  plataforma) além do papel de cliente. Ser dono de um negócio é dado pelo vínculo BusinessMember,
  não por um papel global.
- **Agendamento (Booking)** e **Lançamento (LedgerEntry/itens)**: reusados das features anteriores;
  cada um pertence a um negócio (a coluna de negócio é a renomeada). Cliente é global; o negócio de
  cada registro é explícito para as listagens do cliente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **0%** de vazamento entre negócios: em 100% das tentativas de um dono de A ler/escrever
  dados de B (com ou sem manipulação do identificador na entrada), a operação é recusada no servidor.
- **SC-002**: 100% das operações de dono (serviços, financeiro, caixa/razão, inativação) são
  escopadas pelo **negócio ativo do vínculo**; 0% derivam o negócio da entrada.
- **SC-003**: 100% das criações de negócio e promoções de dono são feitas **apenas por ADMIN** e
  registram autor e momento; 100% das tentativas por não-ADMIN são recusadas no servidor.
- **SC-004**: **0** promoções de dono/ADMIN por self-service; a única elevação fora da plataforma é o
  bootstrap do primeiro ADMIN, documentado.
- **SC-005**: A migração preserva **100%** dos dados existentes: contagem e vínculo de negócio de
  agendamentos, lançamentos e serviços permanecem idênticos ao estado anterior; **0** registros
  perdidos ou re-associados ao negócio errado.
- **SC-006**: **100%** dos testes das features anteriores (a suíte existente) continuam verdes após as
  duas migrações.
- **SC-007**: 100% dos negócios são acessíveis por sua página pública de slug; slugs inexistentes
  retornam 404 tratado em 100% dos casos; slug é único (0 colisões aceitas).
- **SC-008**: A não-sobreposição de agendamentos permanece **por negócio** após o rename: em 100% dos
  casos, agendamentos de negócios diferentes no mesmo horário coexistem, e a sobreposição dentro do
  mesmo negócio continua impossível no nível de dados.
- **SC-009**: 100% das listagens do cliente ("meus agendamentos", "meus gastos") agregam itens de
  todos os negócios do cliente, cada item identificando seu negócio; a conta do cliente é única (0
  cadastros por negócio).
- **SC-010**: Um dono vinculado a **N** negócios acessa exatamente esses **N** (nem mais, nem menos)
  via o seletor de negócio ativo; com 1 negócio, opera sem seleção.

## Assumptions

- **Renomeação sem lógica nova**: a etapa de rename (negócio/serviço + campo segmento) é puramente
  estrutural; nenhum comportamento muda nela. A etapa funcional (ADMIN, membros, slug, backfill) vem
  depois, em migração separada — reduz risco e mantém a regressão verificável entre as etapas.
- **Papéis**: "ADMIN" é papel **de plataforma** (operador); "dono" é papel **de negócio** (via
  BusinessMember). São ortogonais — um usuário pode ser ADMIN, dono de um ou mais negócios, cliente,
  ou combinações. O guard de dono passa a consultar o vínculo, não um papel global.
- **Autogestão do dono (confirmada na clarificação)**: no MVP o dono edita, via UI própria e escopado
  ao negócio ativo, os **horários de funcionamento (OpeningHours)** e o **catálogo de serviços**
  (F002), além de operar o financeiro. NÃO edita a **identidade do negócio** — **nome, slug, fuso
  (timezone) e segmento** são exclusivos do ADMIN (o slug é imutável pela UI — QR codes impressos).
  Edição de identidade pelo dono fica para uma feature futura.
- **Seleção de negócio ativo (confirmada na clarificação)**: o negócio ativo é **estado de sessão no
  servidor**, nunca parâmetro de request. O dono com vários negócios escolhe no seletor e a escolha
  **persiste** (sessão/cookie server-side); **toda** operação de dono deriva o `businessId` desse
  estado e **revalida o vínculo** (membro OWNER daquele negócio?) a cada request. Com um único negócio
  ele é auto-selecionado (seletor oculto); com zero negócios as telas de dono mostram estado vazio
  orientando contato com o ADMIN, sem erro. O `businessId` nunca vem da entrada (anti-IDOR — US3).
- **Slug (confirmada na clarificação)**: informado pelo ADMIN na criação, **pré-preenchido** por
  derivação do nome (kebab-case, sem acentos) e editável; validado no servidor por formato URL-safe
  (`^[a-z0-9]+(-[a-z0-9]+)*$`), unicidade e lista de **slugs reservados** (rotas do app). Imutável pela
  UI no MVP. Descoberta de negócio é **somente** pelo slug (sem marketplace/listagem pública).
- **Cliente global**: a conta de cliente já é única; a feature apenas torna as listagens **cientes de
  negócio** (rótulo por item). Nenhum isolamento de cliente por negócio é introduzido.
- **Bootstrap do primeiro ADMIN**: manual e documentado (seed/script), promovendo a conta do operador
  (o email do operador da plataforma). É a única elevação feita fora da plataforma.
- **Reuso das features anteriores**: F001 (não-sobreposição por negócio), F002 (serviços/horários),
  F004 (remarcação — mantém o mesmo negócio), F005 (captura financeira) e F006 (balancete/histórico)
  são preservadas e passam a ser escopadas por negócio; a disciplina anti-IDOR replica o padrão do
  identificador de cliente da F006.
- **Fora de escopo confirmado**: agenda por profissional/escolha de barbeiro (só a fundação do papel
  STAFF), personalização visual da página, marketplace, autogestão de identidade pelo dono, cobrança/
  planos, e multi-vertical real (o campo segmento existe e permanece em "barbearia").
