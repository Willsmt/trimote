# Feature Specification: Remarcar Agendamento

**Feature Branch**: `004-reschedule-booking`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "remarcar agendamento — permitir que o cliente dono mova um agendamento ativo futuro para novo horário e/ou troque o serviço, mantendo a identidade do agendamento (movido, não cancelado-e-recriado)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mover um agendamento ativo futuro para outro horário (Priority: P1)

O cliente autenticado vê seus agendamentos, escolhe um agendamento ativo e futuro do qual é
dono, e o remarca para um novo dia/horário entre os horários realmente livres. Ao confirmar, o
**mesmo** agendamento passa a existir no novo horário e o horário antigo volta a ficar livre para
outros clientes. O serviço permanece o mesmo.

**Why this priority**: É o núcleo da feature — mover um agendamento sem cancelar e recriar. Entrega
valor por si só (o cliente deixa de precisar do fluxo cancelar+agendar) e é o caminho mais comum.

**Independent Test**: Como dono de um agendamento ativo futuro, abrir a remarcação, escolher um
horário livre, confirmar, e verificar que (a) o agendamento aparece no novo horário com a mesma
identidade, e (b) o horário antigo volta a ser ofertado como livre.

**Acceptance Scenarios**:

1. **Given** um cliente dono de um agendamento ativo e futuro, **When** ele remarca para um horário
   livre do mesmo serviço, **Then** o agendamento passa a existir no novo horário (mesma identidade)
   e o horário antigo fica livre para outros clientes.
2. **Given** a tela de remarcação de um agendamento, **When** o cliente vê os horários disponíveis,
   **Then** apenas horários realmente livres (não passados, sem colisão com agendamento ativo) são
   oferecidos, pela mesma regra de disponibilidade já existente.
3. **Given** um cliente que remarcou com sucesso, **When** outro cliente consulta a disponibilidade
   do horário antigo, **Then** o horário antigo aparece como livre.

---

### User Story 2 - Trocar o serviço ao remarcar (Priority: P2)

Durante a remarcação, o cliente pode opcionalmente escolher um serviço diferente do atual. Como
serviços têm durações distintas, o sistema só oferece horários em que o **novo** serviço cabe
inteiro no expediente e sem colidir com outros agendamentos ativos. Ao confirmar, o agendamento
passa a refletir o novo serviço e o novo horário, mantendo sua identidade.

**Why this priority**: Estende a remarcação (US1) com a troca de serviço. Depende do fluxo de mover
existir; agrega valor (ex.: cliente decide fazer um serviço mais longo/curto) mas não é o mínimo.

**Independent Test**: Ao remarcar, trocar para um serviço de duração diferente e confirmar que só
aparecem horários em que esse serviço cabe inteiro; confirmar e verificar que o agendamento reflete
o novo serviço e horário com a mesma identidade.

**Acceptance Scenarios**:

1. **Given** um cliente remarcando um agendamento, **When** ele seleciona um serviço diferente,
   **Then** apenas horários em que o novo serviço cabe inteiro no expediente (e sem colisão) são
   oferecidos.
2. **Given** um novo serviço cuja duração não cabe num determinado horário/expediente, **When** o
   cliente vê os horários, **Then** aquele horário não é oferecido.
3. **Given** um cliente que escolheu novo serviço e novo horário válidos, **When** ele confirma,
   **Then** o agendamento passa a refletir o novo serviço e horário, com a mesma identidade, e o
   horário antigo fica livre.

---

### User Story 3 - Proteções e recusas da remarcação (Priority: P3)

A remarcação respeita as mesmas garantias do agendamento: só o dono remarca o próprio agendamento;
só agendamentos ativos e futuros podem ser remarcados; não se remarca para o passado nem para um
horário que colida com outro agendamento ativo. Em caso de recusa, o agendamento não é movido e o
cliente recebe uma mensagem clara.

**Why this priority**: É a garantia de integridade/segurança que cerca o fluxo. O valor de mover
(US1/US2) é entregue antes; esta história assegura que casos inválidos e concorrência sejam
recusados sem corromper o agendamento.

**Independent Test**: Tentar remarcar (a) um agendamento de outro cliente, (b) um agendamento
cancelado ou já passado, (c) para um horário no passado, e (d) para um horário recém-ocupado por
outro cliente entre ver e confirmar; verificar que todas são recusadas com mensagem clara e sem
mover o agendamento.

**Acceptance Scenarios**:

1. **Given** um agendamento que não pertence ao cliente, **When** ele tenta remarcá-lo, **Then** a
   ação é recusada e o agendamento não é alterado.
2. **Given** um agendamento já cancelado ou já passado, **When** o cliente tenta remarcá-lo,
   **Then** a ação é recusada (apenas ativos e futuros podem ser remarcados).
3. **Given** uma remarcação para um horário no passado, **When** o cliente confirma, **Then** a
   ação é recusada.
4. **Given** dois clientes, **When** o horário-alvo é ocupado por outro entre o cliente ver os
   horários e confirmar, **Then** a remarcação é recusada com mensagem clara e o agendamento
   original permanece intacto (não é movido).

---

### Edge Cases

- **Fuso horário**: toda verificação de "passado" e de horário ocorre em `America/Sao_Paulo` (regra
  existente), com armazenamento em UTC.
- **Concorrência**: se o horário-alvo for ocupado por outro cliente entre a visualização e a
  confirmação, a remarcação é recusada com mensagem clara, sem mover o agendamento — coberto pela
  garantia de não-sobreposição no nível de dados já existente.
- **Remarcar para o mesmo horário (e mesmo serviço)**: sem mudança real, é **recusado de forma
  amigável** (o sistema informa que aquele já é o horário/serviço atual), sem alterar nada e sem
  gerar conflito falso do agendamento contra si mesmo.
- **Trocar só o serviço, mantendo o horário**: permitido desde que o novo serviço caiba no mesmo
  horário/expediente sem colidir; a verificação de sobreposição não deve contar o próprio
  agendamento como conflito.
- **Agendamento que passa a estar no passado enquanto a tela está aberta**: ao confirmar, a regra de
  "não remarcar agendamento passado / não remarcar para o passado" recusa a ação.

## Clarifications

### Session 2026-06-30

- Q: Remarcar para o mesmo horário E mesmo serviço (sem mudança real) — no-op silencioso ou recusa
  amigável? → A: **Recusa amigável** — o sistema informa que aquele já é o horário/serviço atual do
  agendamento e não altera nada (trava a mais para o cliente não achar que remarcou quando nada mudou).
- Q: "Futuro" para remarcar — só antes de começar (startsAt) ou enquanto não terminou (endsAt)? → A:
  **Só antes de começar** — remarcável apenas enquanto o início (startsAt) ainda não passou; um
  agendamento em andamento (já começou, não terminou) NÃO é remarcável.
- Q: O servidor deve recusar remarcar para um serviço inativo? → A: **Sim, mas só ao TROCAR de
  serviço** — se o cliente escolhe um serviço diferente do atual e ele está inativo, o servidor recusa
  (reason `service_inactive`); se mantém o **mesmo** serviço (ainda que tenha ficado inativo), não
  checa `isActive` (preserva o agendamento e permite apenas mover o horário).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o cliente dono de um agendamento ativo e futuro o remarque
  para um novo dia/horário, mantendo a **mesma identidade** do agendamento (movido, não
  cancelado-e-recriado).
- **FR-002**: O sistema MUST oferecer, na remarcação, apenas horários realmente livres para o
  serviço escolhido naquele dia, pela **mesma regra de disponibilidade** já existente (sem passado,
  sem colisão com agendamento ativo, cabendo no expediente).
- **FR-003**: Ao concluir a remarcação, o sistema MUST liberar o horário antigo para outros clientes.
- **FR-004**: O sistema MUST permitir, opcionalmente, trocar o serviço durante a remarcação; o novo
  serviço MUST caber inteiro no horário/expediente escolhido, senão aquele horário NÃO MUST ser
  oferecido.
- **FR-005**: O sistema NÃO MUST permitir remarcar para um horário no passado (verificação em
  `America/Sao_Paulo`).
- **FR-006**: O sistema NÃO MUST permitir remarcar para um horário que colida com outro agendamento
  ativo (mesma garantia de não-sobreposição já existente).
- **FR-007**: O sistema MUST permitir a remarcação somente pelo dono do agendamento; um cliente NÃO
  MUST conseguir remarcar agendamento de outro cliente.
- **FR-008**: O sistema MUST permitir remarcar somente agendamentos **ativos e futuros**; um
  agendamento já cancelado ou já passado NÃO MUST poder ser remarcado. "Passado/futuro" é medido pelo
  **início (`startsAt`)** em `America/Sao_Paulo`: um agendamento **em andamento** (início já ocorrido,
  ainda não terminado) também NÃO MUST poder ser remarcado.
- **FR-009**: Em caso de recusa (horário ocupado por concorrência, passado, colisão, agendamento
  inválido), o sistema MUST recusar com mensagem clara e NÃO MUST mover/alterar o agendamento.
- **FR-010**: A verificação de propriedade e de elegibilidade (ativo/futuro) MUST ocorrer no
  servidor; não MUST depender apenas da interface.
- **FR-011**: NÃO MUST haver janela mínima de antecedência nem qualquer trava por tempo: remarcar é
  permitido a qualquer momento enquanto o agendamento ainda não passou.
- **FR-012**: A remarcação para o **mesmo horário e mesmo serviço** (sem mudança real) MUST ser
  **recusada de forma amigável** — informando ao cliente que aquele já é o horário e serviço atuais
  do agendamento — sem alterar nada. A verificação NÃO MUST contar o próprio agendamento como
  conflito contra si mesmo (ver Key Entities › Disponibilidade).
- **FR-013**: NÃO MUST notificar o barbeiro ou qualquer pessoa sobre a remarcação (fora de escopo —
  feature de notificações futura).
- **FR-014**: Ao **trocar** o serviço na remarcação, o sistema MUST recusar, no servidor, um serviço
  **inativo** — apenas serviços ativos podem ser escolhidos como **novo** serviço. Manter o **mesmo**
  serviço já associado ao agendamento — ainda que tenha se tornado inativo — NÃO MUST ser bloqueado
  (preserva o agendamento existente; permite apenas mudar o horário). A interface oferta só serviços
  ativos (conveniência); o servidor é a barreira (ver FR-010).

### Key Entities *(include if feature involves data)*

- **Agendamento (Booking)**: o agendamento existente que é movido. Mantém sua identidade ao ser
  remarcado; atributos relevantes que mudam: horário (início/fim) e, opcionalmente, o serviço
  associado. Atributos de estado: ativo/cancelado; pertence a um cliente (dono). Reusa o modelo de
  agendamento já existente.
- **Serviço (Service)**: o serviço associado ao agendamento. Tem uma duração que determina se cabe
  num horário/expediente. O cliente pode trocar o serviço do agendamento na remarcação. Reusa o
  catálogo de serviços já existente (apenas serviços ativos são ofertáveis). Ao **trocar** de serviço,
  o servidor recusa um serviço inativo (não apenas o esconde na UI); **manter** o serviço atual já
  associado NÃO é bloqueado, mesmo que ele tenha se tornado inativo.
- **Disponibilidade (derivada)**: conjunto de horários livres para um serviço num dia, derivado do
  expediente e dos agendamentos ativos. Reusa a regra de disponibilidade já existente; na
  remarcação, o próprio agendamento sendo movido não conta como conflito contra si mesmo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das remarcações de um dono sobre seu agendamento ativo futuro para um horário
  livre resultam no agendamento existindo no novo horário com a mesma identidade.
- **SC-002**: 100% dos horários ofertados na remarcação são horários em que o serviço escolhido cabe
  inteiro e está livre; nenhum horário passado, colidente ou que não comporte o serviço é oferecido.
- **SC-003**: Após uma remarcação concluída, o horário antigo volta a ser ofertado como livre em
  100% dos casos.
- **SC-004**: 100% das tentativas de remarcar para o passado ou para um horário colidente são
  recusadas, sem mover o agendamento.
- **SC-005**: 100% das tentativas de um cliente remarcar agendamento de outro cliente são recusadas.
- **SC-006**: 100% das tentativas de remarcar um agendamento já cancelado ou já passado são
  recusadas.
- **SC-007**: Sob concorrência (horário-alvo ocupado entre ver e confirmar), 0% das remarcações
  resultam em sobreposição; a ação é recusada e o agendamento original permanece intacto.
- **SC-008**: O cliente consegue concluir uma remarcação simples (mesmo serviço, novo horário) em
  menos de 1 minuto.
- **SC-009**: 100% das tentativas de **trocar** para um serviço inativo são recusadas no servidor;
  manter o mesmo serviço (mesmo que inativo) apenas para mudar o horário não é bloqueado.

## Assumptions

- A feature reutiliza o modelo de agendamento, o de propriedade (dono derivado da sessão no
  servidor) e a regra de disponibilidade/não-sobreposição já existentes (001/002); nenhuma nova
  garantia temporal é introduzida.
- "Agendamento ativo" significa um agendamento com status ativo (não cancelado); "futuro" significa
  cujo **início (`startsAt`)** ainda não passou em `America/Sao_Paulo` — um agendamento já em
  andamento (início ocorrido, ainda não terminado) não é remarcável.
- **Remarcar para o mesmo horário e mesmo serviço** (sem mudança real) é **recusado de forma
  amigável** (decisão de produto — ver Clarifications): o sistema informa que aquele já é o
  horário/serviço atual e não altera nada, evitando que o cliente ache que remarcou quando nada
  mudou. O cálculo de disponibilidade não conta o próprio agendamento como conflito consigo mesmo.
- A disponibilidade na remarcação desconsidera o próprio agendamento sendo movido ao calcular
  colisões (senão o agendamento bloquearia o próprio horário atual ou janelas adjacentes).
- Trocar apenas o serviço mantendo o mesmo horário é uma remarcação válida (um caso particular de
  FR-004), desde que o novo serviço caiba.
- A interface de remarcação parte da lista "Meus agendamentos" já existente; nenhuma nova área de
  navegação é criada por esta feature.
- Notificações, janelas de antecedência, pagamento/penalidade, remarcação pelo OWNER e limite de
  remarcações estão fora de escopo (explicitamente).
