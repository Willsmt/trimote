# Feature Specification: Navegação e Sessão

**Feature Branch**: `003-nav-session`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "navegacao e sessao no Trimote — tornar o app usavel sem digitar URLs na mao, dando ao usuario um ponto de entrada de login, um jeito de sair, e navegacao visivel conforme quem ele e. Feature funcional, NAO redesign."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar e sair pela navegação (Priority: P1)

Um visitante chega na home sem estar autenticado. Na navegação ele encontra uma ação
"Entrar" (login com Google), autentica, e ao voltar continua na aplicação já reconhecido
como usuário logado — sem ter digitado nenhuma URL. A qualquer momento ele encontra na
navegação uma ação "Sair" que encerra a sessão e o devolve à condição de visitante.

**Why this priority**: Sem um ponto de entrada de login e uma saída visíveis, o app é
inutilizável sem conhecimento prévio de URLs. Este é o núcleo mínimo que torna a aplicação
navegável e entrega valor por si só.

**Independent Test**: Acessar a home como visitante, confirmar que existe a ação "Entrar",
autenticar com Google, confirmar que a sessão fica ativa e que a ação "Sair" aparece e
funciona, voltando à condição de visitante. Testável e demonstrável isoladamente.

**Acceptance Scenarios**:

1. **Given** um visitante não autenticado na home, **When** ele aciona "Entrar" pela
   navegação, **Then** o fluxo de login com Google é iniciado sem necessidade de digitar URL.
2. **Given** um visitante que concluiu o login com Google, **When** ele retorna à aplicação,
   **Then** a navegação passa a indicar uma sessão ativa e oferece a ação "Sair".
3. **Given** um usuário autenticado, **When** ele aciona "Sair", **Then** a sessão é
   encerrada e a navegação volta a exibir a condição de visitante (ação "Entrar").

---

### User Story 2 - Navegação conforme o papel do usuário (Priority: P2)

Dependendo de quem é o usuário, a navegação exibe os links a que ele tem direito: o
visitante vê apenas "Entrar" e a listagem pública de serviços; o CLIENT vê "Meus
agendamentos", o caminho para agendar e "Sair"; o OWNER vê tudo do CLIENT mais o acesso ao
"Painel" do dono. A indicação de sessão mostra quem está logado (nome ou e-mail).

**Why this priority**: Depende da existência de sessão (US1). Uma vez que o usuário pode
entrar e sair, mostrar os destinos certos conforme o papel é o que efetivamente permite
navegar entre as áreas sem decorar URLs.

**Independent Test**: Com a sessão funcionando, autenticar como CLIENT e confirmar o
conjunto de links de cliente (sem "Painel"); autenticar como OWNER e confirmar que o
"Painel" aparece adicionalmente; como visitante, confirmar que nenhum link de área logada
aparece. A indicação de sessão reflete o usuário logado.

**Acceptance Scenarios**:

1. **Given** um visitante não autenticado, **When** ele vê a navegação, **Then** são
   exibidos "Entrar" e o acesso à listagem pública de serviços, e nenhum link de área logada.
2. **Given** um CLIENT autenticado, **When** ele vê a navegação, **Then** são exibidos "Meus
   agendamentos", o caminho para agendar e "Sair", e o "Painel" do dono NÃO é exibido.
3. **Given** um OWNER autenticado, **When** ele vê a navegação, **Then** são exibidos todos
   os links do CLIENT mais o acesso ao "Painel" do dono.
4. **Given** qualquer usuário autenticado, **When** ele observa a indicação de sessão,
   **Then** ela exibe o usuário realmente logado (nome ou e-mail).

---

### User Story 3 - Visibilidade de link não enfraquece a proteção do servidor (Priority: P3)

A decisão de mostrar ou esconder links é conveniência de interface, não barreira de
segurança. Mesmo que um CLIENT descubra e acesse diretamente a URL do painel do dono, o
servidor continua barrando o acesso pela verificação já existente (`requireOwner`). Esta
feature não altera nem enfraquece nenhuma proteção existente.

**Why this priority**: É uma garantia de não-regressão/qualidade que acompanha a navegação
por papel. O valor de navegação (US1, US2) é entregue antes; esta história assegura que a
conveniência de UI não vire a única barreira.

**Independent Test**: Como CLIENT autenticado, navegar diretamente para a URL do painel do
dono e confirmar que o servidor barra o acesso, independentemente de o link estar oculto na
navegação.

**Acceptance Scenarios**:

1. **Given** um CLIENT autenticado cujo link de "Painel" está oculto, **When** ele acessa
   diretamente a URL do painel do dono, **Then** o servidor barra o acesso (proteção
   inalterada).
2. **Given** a navegação por papel implementada, **When** se compara o comportamento das
   áreas restritas antes e depois desta feature, **Then** nenhuma proteção existente é
   removida ou enfraquecida.

---

### Edge Cases

- **Sessão expira durante a navegação**: ao expirar, a navegação volta a refletir a
  condição de visitante (exibe "Entrar", oculta links de área logada e a indicação de
  sessão), sem exigir que o usuário digite URL para se recuperar.
- **Promoção/rebaixamento de papel** (CLIENT ↔ OWNER) durante uma sessão: a navegação
  reflete o papel atual lido do servidor, não um estado cacheado obsoleto. Um usuário
  recém-promovido a OWNER passa a ver o "Painel"; um rebaixado a CLIENT deixa de vê-lo.
- **Usuário autenticado mas sem papel reconhecido**: tratado de forma segura, exibindo no
  máximo a navegação de menor privilégio (equivalente a CLIENT) e nunca o "Painel" do dono.
- **Acesso direto a uma área logada sem sessão**: o usuário é conduzido ao login e, ao
  autenticar, retorna a uma navegação coerente com seu papel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A navegação MUST oferecer ao visitante uma ação "Entrar" que inicia o login
  com Google, acessível sem que o usuário precise digitar uma URL.
- **FR-002**: A navegação MUST oferecer a todo usuário autenticado uma ação "Sair" que
  encerra a sessão e o retorna à condição de visitante.
- **FR-003**: Após autenticar, o usuário MUST ser apresentado a uma navegação correspondente
  ao seu papel atual, sem necessidade de digitar URL.
- **FR-004**: A navegação MUST exibir, para o visitante, a ação "Entrar" e o acesso à
  listagem pública de serviços, e NÃO MUST exibir links de área logada.
- **FR-005**: A navegação MUST exibir, para o CLIENT, os links "Meus agendamentos", o
  caminho para agendar e "Sair", e NÃO MUST exibir o acesso ao "Painel" do dono.
- **FR-006**: A navegação MUST exibir, para o OWNER, todos os links do CLIENT mais o acesso
  ao "Painel" do dono.
- **FR-007**: A navegação MUST exibir uma indicação de sessão ativa que identifique o
  usuário logado (nome ou e-mail).
- **FR-008**: A navegação MUST aparecer de forma consistente nas páginas do app.
- **FR-009**: O papel usado para decidir os links da navegação MUST ser lido do servidor e
  refletir o papel atual do usuário, não um estado cacheado obsoleto.
- **FR-010**: A visibilidade de links conforme o papel MUST ser tratada como conveniência de
  interface e NÃO MUST ser a barreira de segurança das áreas restritas.
- **FR-011**: A proteção real das áreas restritas (ex.: painel do dono) MUST permanecer a
  verificação no servidor já existente (`requireOwner`); esta feature NÃO MUST removê-la nem
  enfraquecê-la.
- **FR-012**: Quando a sessão expirar, a navegação MUST voltar a refletir a condição de
  visitante.
- **FR-013**: O escopo desta feature NÃO MUST incluir mudanças na lógica de agendamento, na
  autorização do servidor ou no painel do dono já existentes, além do necessário para expor
  a navegação.

### Key Entities *(include if feature involves data)*

- **Sessão do usuário**: representa o estado de autenticação atual. Atributos relevantes para
  esta feature: se há ou não sessão ativa, e a identidade exibível do usuário (nome ou
  e-mail). Reutiliza o mecanismo de sessão já existente.
- **Papel do usuário (role)**: classificação do usuário autenticado — CLIENT ou OWNER — lida
  do servidor, que determina o conjunto de links exibidos na navegação. Reutiliza o `role`
  já existente no usuário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos visitantes conseguem iniciar o login a partir da navegação sem digitar
  nenhuma URL.
- **SC-002**: Após autenticar, o usuário vê a navegação correspondente ao seu papel em 100%
  das sessões, sem digitar URL.
- **SC-003**: 100% dos usuários autenticados conseguem encerrar a sessão pela ação "Sair" e
  retornar à navegação de visitante.
- **SC-004**: O acesso ao "Painel" do dono aparece na navegação somente para OWNER em 100%
  dos casos; nenhum visitante ou CLIENT vê o link.
- **SC-005**: Em 100% das tentativas de um CLIENT acessar diretamente a URL do painel do
  dono, o servidor barra o acesso (zero regressões em relação à proteção anterior).
- **SC-006**: A indicação de sessão corresponde ao usuário realmente logado em 100% das
  sessões verificadas.
- **SC-007**: Quando a sessão expira, a navegação volta à condição de visitante em 100% dos
  casos observados, sem intervenção via digitação de URL.

## Assumptions

- O mecanismo de autenticação existente (login com Google via a infraestrutura de sessão já
  presente na 001/002) é reutilizado; nenhum novo provedor de login é introduzido.
- O campo `role` (CLIENT|OWNER) já existente no usuário é a fonte de verdade do papel, lido
  do servidor a cada navegação.
- A verificação de servidor `requireOwner` já existente é a barreira real das áreas restritas
  e permanece inalterada por esta feature.
- A listagem pública de serviços já existe e é acessível ao visitante; esta feature apenas a
  expõe na navegação.
- Estética, tema, cores, tipografia e responsividade refinada estão fora de escopo (redesign
  é feature futura separada); o objetivo aqui é a navegação existir e funcionar.
- Cadastro/edição de perfil, gestão de usuários, recuperação de conta e múltiplos provedores
  de login estão fora de escopo.
- "Consistente nas páginas do app" significa que a navegação está disponível de forma
  uniforme nas páginas da aplicação onde a navegação faz sentido (home e áreas logadas),
  reaproveitando um ponto único de montagem.
