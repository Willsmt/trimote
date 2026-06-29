# Feature Specification: Agendamento Online de Barbearia (MVP)

**Feature Branch**: `001-barber-booking`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "Trimote é um sistema de agendamento para uma barbearia. Objetivo do MVP:
permitir que um cliente agende um serviço online por conta própria, e garantir que nunca exista
duplo agendamento no mesmo horário."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agendar um serviço (Priority: P1)

O cliente autenticado vê os serviços oferecidos, escolhe um serviço, escolhe um dia, vê apenas os
horários realmente livres daquele dia e confirma o agendamento. Ao confirmar, o sistema garante que
aquele horário não conflita com nenhum outro agendamento existente.

**Why this priority**: É o coração do produto e a razão de existir do MVP. Sem isso, não há valor
entregue. Também concentra a regra de negócio mais crítica (impedir duplo agendamento).

**Independent Test**: Pode ser testada de ponta a ponta autenticando um cliente, listando serviços,
selecionando um serviço e um dia, escolhendo um horário livre e confirmando — verificando que o
agendamento passa a existir e que aquele horário deixa de aparecer como livre.

**Acceptance Scenarios**:

1. **Given** um cliente autenticado e um serviço com duração definida, **When** ele seleciona um dia,
   **Then** o sistema mostra apenas horários em que o serviço cabe inteiro dentro do horário de
   funcionamento e que não se sobrepõem a agendamentos existentes.
2. **Given** um horário livre exibido, **When** o cliente confirma o agendamento, **Then** o
   agendamento é criado e vinculado a esse cliente.
3. **Given** um horário que acabou de ser ocupado por outro cliente, **When** o cliente tenta
   confirmar o mesmo horário, **Then** o sistema recusa a criação e informa que o horário não está
   mais disponível.
4. **Given** um cliente não autenticado, **When** ele tenta confirmar um agendamento, **Then** o
   sistema exige autenticação antes de prosseguir.

---

### User Story 2 - Ver e cancelar os próprios agendamentos (Priority: P2)

O cliente autenticado vê a lista dos seus próprios agendamentos e pode cancelar qualquer um deles.
Cancelar libera aquele horário para outros clientes.

**Why this priority**: Completa o ciclo de autosserviço (gerenciar o que foi criado) e é pré-requisito
para "remarcar" no MVP, que é feito cancelando e criando um novo. Depende da existência de
agendamentos (Story 1).

**Independent Test**: Pode ser testada criando um agendamento, listando os agendamentos do cliente,
cancelando um deles e verificando que o horário volta a aparecer como livre para uma nova consulta de
disponibilidade.

**Acceptance Scenarios**:

1. **Given** um cliente autenticado com agendamentos, **When** ele acessa sua lista, **Then** vê
   apenas os próprios agendamentos.
2. **Given** um agendamento do cliente, **When** ele cancela, **Then** o agendamento deixa de estar
   ativo e aquele horário volta a ser oferecido como livre.
3. **Given** um agendamento que pertence a outro cliente, **When** o cliente tenta vê-lo ou
   cancelá-lo, **Then** o sistema nega o acesso.

---

### User Story 3 - Descobrir os serviços oferecidos (Priority: P3)

O visitante/cliente vê a lista de serviços oferecidos pela barbearia com nome, preço e duração.

**Why this priority**: É a porta de entrada da jornada e informa a escolha, mas tem valor limitado
isolada — só vira valor quando leva ao agendamento (Story 1).

**Independent Test**: Pode ser testada consultando a lista de serviços e verificando que cada serviço
exibe nome, preço e duração.

**Acceptance Scenarios**:

1. **Given** serviços pré-cadastrados, **When** o usuário consulta a lista de serviços, **Then** vê
   cada serviço com nome, preço e duração.

---

### Edge Cases

- **Fuso horário**: todo cálculo de disponibilidade e de conflito ocorre em `America/Sao_Paulo`,
  independentemente do fuso do servidor; o armazenamento é em UTC.
- **Concorrência**: se dois clientes tentam confirmar o mesmo horário simultaneamente, apenas um
  obtém sucesso; o outro recebe recusa de "horário indisponível". Essa garantia é assegurada no nível
  de dados, não apenas na interface.
- **Data/hora no passado**: o sistema não oferece nem aceita agendamento em data ou hora já passada
  (referência de "agora" em `America/Sao_Paulo`).
- **Serviço não cabe antes do fechamento**: um horário de início cujo fim (início + duração) ultrapasse
  o horário de fechamento não é oferecido como livre.
- **Dia sem expediente**: um dia em que a barbearia não funciona não oferece nenhum horário livre.
- **Cancelar agendamento já passado**: ver Assumptions (apenas agendamentos futuros podem ser
  cancelados).
- **Confirmar horário que expirou durante a navegação**: um horário que ficou indisponível entre a
  exibição e a confirmação resulta em recusa clara, sem criar agendamento.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o cliente se autentique antes de criar, listar ou cancelar
  agendamentos.
- **FR-002**: O sistema MUST listar os serviços pré-cadastrados, exibindo para cada um o nome, o preço
  e a duração.
- **FR-003**: O sistema MUST calcular os horários livres de um dia a partir do horário de funcionamento
  da barbearia, descontando os agendamentos já existentes e considerando a duração do serviço escolhido.
- **FR-004**: O sistema MUST oferecer um horário como livre somente se o serviço couber inteiro
  (início + duração) dentro do horário de funcionamento daquele dia.
- **FR-005**: O sistema MUST NOT oferecer horários fora do horário de funcionamento da barbearia.
- **FR-006**: O sistema MUST NOT oferecer nem aceitar agendamentos em data ou hora no passado.
- **FR-007**: O sistema MUST permitir que um cliente autenticado crie um agendamento para um serviço em
  um horário livre.
- **FR-008**: O sistema MUST impedir que dois agendamentos se sobreponham no tempo (incluindo a duração
  do serviço), garantindo essa restrição no nível de dados.
- **FR-009**: O sistema MUST garantir que, sob tentativas concorrentes para o mesmo horário, no máximo
  um agendamento seja criado.
- **FR-010**: O sistema MUST permitir que um cliente autenticado liste apenas os seus próprios
  agendamentos.
- **FR-011**: O sistema MUST permitir que um cliente cancele apenas os seus próprios agendamentos.
- **FR-012**: O sistema MUST impedir que um cliente veja ou cancele agendamentos de outro cliente.
- **FR-013**: Ao cancelar um agendamento, o sistema MUST liberar aquele horário para que volte a ser
  oferecido como livre a outros clientes.
- **FR-014**: O sistema MUST realizar todo cálculo de horário (disponibilidade, conflito, "passado")
  no fuso `America/Sao_Paulo`, armazenando os instantes em UTC.
- **FR-015**: O sistema MUST tratar a tentativa de confirmar um horário que deixou de estar disponível
  com uma recusa explícita, sem criar agendamento.

### Key Entities *(include if feature involves data)*

- **Cliente**: pessoa que se autentica e gerencia os próprios agendamentos. Atributos essenciais:
  identidade/credenciais de acesso e identificação. É o proprietário (owner) de seus agendamentos.
- **Serviço**: oferta pré-cadastrada da barbearia. Atributos: nome, preço e duração. A duração
  determina quanto tempo um agendamento ocupa.
- **Horário de Funcionamento**: janela(s) de atendimento da barbearia por dia, pré-cadastrada. Define
  início e fim do expediente e é a base para derivar os horários livres.
- **Agendamento**: reserva de um cliente para um serviço em um instante de início, ocupando o intervalo
  [início, início + duração]. Pertence a exatamente um cliente. Possui estado (ativo / cancelado).
  Não pode se sobrepor a outro agendamento ativo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das tentativas concorrentes pelo mesmo horário, no máximo um agendamento é
  criado (nenhum duplo agendamento, mesmo sob carga simultânea).
- **SC-002**: 100% dos horários exibidos como livres respeitam o horário de funcionamento e a duração
  do serviço (nenhum horário ultrapassa o fechamento).
- **SC-003**: 0% de acessos bem-sucedidos a agendamentos de terceiros (nenhum cliente consegue ver ou
  cancelar agendamento que não é seu).
- **SC-004**: 100% dos horários liberados por cancelamento voltam a aparecer como livres em uma nova
  consulta de disponibilidade.
- **SC-005**: 0% de agendamentos criados ou exibidos em data/hora no passado.
- **SC-006**: Um cliente consegue completar o fluxo "ver serviços → escolher dia → escolher horário →
  confirmar" em menos de 2 minutos.

## Assumptions

- **Autenticação**: assume-se autenticação padrão de cliente por credenciais (ex.: e-mail e senha);
  o método específico será definido no plano. Não há perfis de administrador/dono no MVP.
- **Dados pré-cadastrados**: serviços e horário de funcionamento já existem no sistema e não são
  gerenciados por esta feature (sem CRUD do dono no MVP).
- **Granularidade de horários**: os horários livres são gerados em intervalos regulares a partir da
  abertura (ex.: a cada 15 ou 30 minutos); o passo exato é um parâmetro de configuração definido no
  plano. Cada horário oferecido respeita a duração do serviço escolhido.
- **Recurso único**: o MVP assume uma única barbearia e um único recurso/cadeira de atendimento;
  portanto qualquer sobreposição temporal é um conflito. (Múltiplos profissionais estão fora de escopo.)
- **Cancelamento**: apenas agendamentos futuros (ativos) podem ser cancelados; "remarcar" no MVP é
  cancelar e criar um novo.
- **Conectividade**: assume-se que o cliente acessa o sistema online com conectividade estável.

## Out of Scope

As capacidades a seguir estão **explicitamente fora** do MVP:

- Busca/marketplace entre várias barbearias.
- Suporte a múltiplas barbearias.
- Painel ou CRUD do dono (gestão de serviços e de horário de funcionamento pela interface).
- Avaliações.
- Pagamentos.
- Notificações.
- Remarcar diretamente (no MVP o cliente cancela e cria um novo).
