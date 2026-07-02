# Feature Specification: Financeiro — Captura de Lançamentos

**Feature Branch**: `005-financial-ledger`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Financeiro — captura de lançamentos (F005). Permitir que o OWNER registre todo o dinheiro que entra e sai da barbearia, formando a base do balancete. Cobre apenas os caminhos de escrita (captura); relatórios e agregações ficam para a F006. Pagamento online não faz parte do escopo — apenas deixamos o modelo preparado para ele."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Concluir atendimento agendado e gerar receita (Priority: P1)

O OWNER autenticado vê um agendamento ativo e, ao final do serviço, marca "atendimento OK".
O agendamento passa ao estado terminal **concluído** e, na **mesma operação atômica**, é gerado
um lançamento de **receita** (origem: agendamento) contendo um item do serviço agendado. O valor
do item é um **snapshot** do preço do serviço no momento da conclusão — não uma referência ao preço
vivo do serviço. Se um dos passos falhar, nenhum dos dois ocorre.

**Why this priority**: É o núcleo da captura financeira e a fonte primária de receita da barbearia.
Liga o agendamento (features 001/004) ao razão financeiro e materializa a fidelidade histórica do
preço. Entrega valor por si só: o OWNER passa a ter o dinheiro dos atendimentos concluídos registrado.

**Independent Test**: Concluir um agendamento ativo e verificar que (a) o agendamento fica concluído,
(b) existe um lançamento de receita de origem agendamento vinculado a ele, (c) o item reflete o preço
do serviço no instante da conclusão, e (d) alterar o preço do serviço depois NÃO muda o valor já
lançado.

**Acceptance Scenarios**:

1. **Given** um agendamento ativo do qual o OWNER é dono, **When** ele marca o atendimento como
   concluído, **Then** o agendamento passa a concluído e é criado um lançamento de receita (origem
   agendamento) com um item do serviço agendado, tudo na mesma operação atômica.
2. **Given** um atendimento concluído com valor snapshot, **When** o preço do serviço é alterado
   depois, **Then** o valor do lançamento e do item permanecem inalterados (fidelidade histórica).
3. **Given** a criação do lançamento falha por qualquer motivo, **When** a conclusão é tentada,
   **Then** o agendamento NÃO fica concluído e nenhum lançamento parcial é persistido.
4. **Given** um agendamento já concluído, **When** o OWNER tenta concluí-lo novamente, **Then** a
   ação é recusada e nenhum lançamento duplicado é criado.

---

### User Story 2 - Adicionar extras ao atendimento (Priority: P2)

No **ato** de concluir um atendimento agendado (US1) ou de registrar um walk-in (US3), o OWNER pode
adicionar **extras** feitos na hora (ex.: corte agendado + barba feita no momento). Cada extra é um
item adicional do lançamento. O valor total do lançamento é **recalculado como a soma dos itens** e
essa soma é validada **dentro da mesma operação atômica** que cria o lançamento. Extras podem
referenciar um serviço do catálogo ou ser um item manual livre (sem serviço associado). Depois que o
agendamento atinge o estado terminal concluído, não há edição posterior de itens: a única mutação
permitida sobre o lançamento é o soft delete (US5).

**Why this priority**: Estende a captura (US1/US3) para o caso real em que o cliente consome mais do
que o previsto. Depende de existir um lançamento de receita ao qual anexar itens; agrega valor, mas
não é o mínimo.

**Independent Test**: No momento da captura de um atendimento, adicionar um ou mais itens extras (com
e sem serviço associado) e verificar que o valor total do lançamento é exatamente a soma de todos os
itens, validada na transação; e verificar que, após a conclusão, não é possível adicionar/alterar/
remover itens (só soft delete do lançamento).

**Acceptance Scenarios**:

1. **Given** um atendimento sendo registrado, **When** o OWNER adiciona um extra referenciando um
   serviço do catálogo, **Then** um novo item é criado com o snapshot do preço desse serviço e o
   total do lançamento passa a ser a soma dos itens.
2. **Given** um atendimento sendo registrado, **When** o OWNER adiciona um extra manual (sem serviço,
   com descrição e valor próprios), **Then** um novo item é criado e o total do lançamento é a soma
   dos itens.
3. **Given** um lançamento com vários itens sendo capturado, **When** os itens são definidos, **Then**
   o valor total do lançamento é igual à soma dos valores dos itens, validado dentro da mesma operação
   atômica que cria o lançamento.
4. **Given** um lançamento de um atendimento já concluído, **When** o OWNER tenta adicionar, alterar
   ou remover um item, **Then** a ação é recusada — a única mutação permitida sobre o lançamento é o
   soft delete (US5).

---

### User Story 3 - Registrar atendimento avulso (walk-in) (Priority: P2)

O OWNER registra um atendimento de um cliente que **chegou sem agendar**. É gerado um lançamento de
**receita** (origem: avulso), com um ou mais itens, **sem** vínculo a agendamento. O cliente pode ser
identificado (cliente cadastrado) ou **anônimo** (nome livre, ou nem isso). O walk-in **não** passa
pela regra de não-sobreposição da agenda (não é um agendamento).

**Why this priority**: Cobre a receita que não vem da agenda — comum numa barbearia. Independente do
fluxo de conclusão de agendamento (US1). Entrega valor por si só: capturar dinheiro de quem não
agendou.

**Independent Test**: Registrar um walk-in com itens e (a) um cliente cadastrado, (b) um nome livre,
(c) sem identificação; verificar que cada caso gera um lançamento de receita de origem avulso, sem
vínculo a agendamento e sem tocar na agenda/disponibilidade.

**Acceptance Scenarios**:

1. **Given** um cliente que chegou sem agendar, **When** o OWNER registra o atendimento com itens,
   **Then** é criado um lançamento de receita (origem avulso) com os itens e sem vínculo a agendamento.
2. **Given** o registro de um walk-in, **When** o OWNER identifica o cliente pelo cadastro OU informa
   apenas um nome livre OU não informa nenhum, **Then** o lançamento é criado corretamente nos três
   casos.
3. **Given** um walk-in registrado, **When** a agenda/disponibilidade é consultada, **Then** o walk-in
   NÃO ocupa horário nem afeta a regra de não-sobreposição (não é agendamento).

---

### User Story 4 - Registrar despesa (Priority: P2)

O OWNER registra uma **despesa** da barbearia (ex.: aluguel, produtos, energia). É gerado um
lançamento de **despesa** (origem: despesa) com descrição, categoria e valor, **sem** itens e **sem**
cliente.

**Why this priority**: A saída de dinheiro é metade do balancete. Independente das receitas; entrega
valor por si só (registrar custos). Simples, sem itens.

**Independent Test**: Registrar uma despesa com descrição, categoria e valor e verificar que é criado
um lançamento de despesa sem itens e sem cliente, e que ele entra no razão como saída de dinheiro.

**Acceptance Scenarios**:

1. **Given** um gasto da barbearia, **When** o OWNER registra uma despesa com descrição, categoria e
   valor, **Then** é criado um lançamento de despesa (origem despesa) sem itens e sem cliente.
2. **Given** um lançamento de despesa, **When** ele é lido no razão, **Then** representa uma saída de
   dinheiro (o sinal vem do tipo, não do valor, que é sempre positivo).

---

### User Story 5 - Corrigir lançamento errado via soft delete (Priority: P3)

O OWNER percebe um lançamento incorreto (valor errado, duplicado, categoria trocada). A correção é
feita marcando o lançamento como **inativo** (soft delete), **nunca** apagando fisicamente nem
lançando um estorno contábil. Um lançamento inativo deixa de contar como dinheiro válido, mas
permanece registrado para auditoria.

**Why this priority**: Disciplina de integridade e auditoria em torno da captura. As histórias de
captura entregam valor antes; esta garante correção sem perda de rastro.

**Independent Test**: Marcar um lançamento como inativo e verificar que (a) ele deixa de contar como
lançamento válido, (b) não foi apagado fisicamente (continua consultável/auditável), e (c) um
lançamento de origem agendamento inativado não desconclui o agendamento.

**Acceptance Scenarios**:

1. **Given** um lançamento errado, **When** o OWNER o marca como inativo, **Then** ele deixa de contar
   como dinheiro válido mas continua existindo (não é apagado fisicamente).
2. **Given** um lançamento inativado, **When** a base é auditada, **Then** o registro permanece
   disponível para consulta.
3. **Given** um lançamento de origem agendamento, **When** ele é inativado, **Then** o agendamento
   correspondente permanece concluído (o soft delete do lançamento não reabre o agendamento).

---

### Edge Cases

- **Concluir agendamento já concluído**: recusado com reason `already_completed`; a máquina de estados
  trata "concluído" como terminal e não gera lançamento duplicado.
- **Remarcar ou cancelar (F004) um agendamento já concluído**: recusado com reason `already_completed`;
  a verificação de "concluído" entra na **ordem existente** de checagem da máquina de estados de
  remarcar/cancelar, antes de mover ou cancelar, com reason distinto de `not_active`/`cancelled`.
- **Snapshot vs. preço vivo**: após a conclusão, alterar o preço do serviço NÃO altera lançamentos
  passados; cada item carrega o valor congelado no momento da captura.
- **Walk-in totalmente anônimo**: nem cliente cadastrado nem nome — permitido; o lançamento existe sem
  identificação de cliente.
- **Soma dos itens ≠ total**: para lançamentos com itens (receita), o total DEVE ser exatamente a soma
  dos itens; a validação ocorre **no momento da captura, dentro da mesma operação atômica** que cria o
  lançamento, e qualquer divergência é rejeitada no servidor. Despesas não têm itens e o valor é
  informado diretamente.
- **Edição de itens após conclusão**: uma vez concluído o atendimento (lançamento persistido), não há
  edição de itens — nem adicionar, nem alterar, nem remover item individual; a única mutação permitida
  sobre o lançamento é o soft delete (US5). Corrigir um lançamento errado = inativar o lançamento
  inteiro e, se necessário, registrar um novo.
- **Valor não-positivo**: valores de lançamento e de item DEVEM ser positivos; o sinal (entrada/saída)
  vem do tipo, não do número. Valor zero ou negativo é rejeitado.
- **Origem × forma de pagamento**: são eixos ortogonais. A origem descreve o **evento** (agendamento /
  avulso / despesa); a forma de pagamento descreve o **meio** (dinheiro / pix / cartão / online /
  outro) e é opcional. Nunca se deduz uma da outra.
- **Preparo para pagamento online**: o modelo aceita forma de pagamento "online" e uma referência
  externa opcional, mas nenhum fluxo online é ativado nesta feature; nenhuma receita é gerada por
  evento externo aqui.
- **Fuso horário**: o momento do lançamento (`occurredAt`) é um instante livre informado na captura
  (não derivado do fim do agendamento); armazenado em UTC e interpretado em `America/Sao_Paulo` na
  lógica de negócio, como no resto do sistema.

## Clarifications

### Session 2026-07-01

- Q: Extras (US2) podem ser adicionados/editados depois que o agendamento vira concluído? → A:
  **Não** — extras são capturados EXCLUSIVAMENTE no ato da conclusão (US1) ou do registro do walk-in
  (US3), dentro da MESMA operação atômica que cria o lançamento. Após o estado terminal concluído, a
  ÚNICA mutação permitida sobre o lançamento é o soft delete (US5). Não há adicionar, alterar nem
  remover item individual de um lançamento concluído; corrigir = inativar o lançamento inteiro e, se
  necessário, registrar um novo.
- Q: A recusa de concluir/remarcar/cancelar um agendamento já concluído reutiliza um reason genérico
  existente? → A: **Não** — DEVE usar um reason próprio e distinto `already_completed`, sem reutilizar
  `not_active`, `cancelled` ou outro reason genérico (reason específico evita renderização ambígua/
  ausente na UI, mesmo tipo de falha do bug conhecido em que `no_change` não renderiza).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o OWNER marque um agendamento ativo como **concluído**;
  ao concluir, MUST gerar, na **mesma operação atômica**, um lançamento de **receita** com origem
  **agendamento**, vinculado ao agendamento, contendo um item do serviço agendado.
- **FR-002**: O valor do item gerado na conclusão MUST ser um **snapshot** do preço do serviço no
  momento da conclusão; lançamentos e itens passados NÃO MUST mudar quando o preço do serviço mudar
  depois.
- **FR-003**: A conclusão do agendamento e a criação do lançamento MUST ser atômicas: se qualquer
  passo falhar, nenhum dos dois é persistido (sem agendamento concluído sem lançamento, nem lançamento
  sem conclusão).
- **FR-004**: **Concluído** MUST ser um estado terminal do agendamento; concluir um agendamento já
  concluído MUST ser recusado e NÃO MUST gerar lançamento duplicado. A recusa MUST emitir o reason
  próprio e distinto `already_completed` (NÃO reutilizar `not_active`, `cancelled` nem outro reason
  genérico), para evitar renderização ambígua/ausente na UI.
- **FR-005**: As ações de **remarcar** e **cancelar** (F004) MUST recusar um agendamento já concluído;
  essa verificação MUST ser integrada na **ordem de checagem existente** da máquina de estados (sem
  reescrever as demais proteções). Nesse caso a recusa MUST emitir o mesmo reason próprio e distinto
  `already_completed` (NÃO reutilizar `not_active`, `cancelled` nem outro reason genérico).
- **FR-006**: O sistema MUST permitir adicionar **extras** (itens adicionais) a um atendimento de
  receita **no ato da captura** (conclusão do agendamento em US1 ou registro do walk-in em US3); cada
  extra MUST poder referenciar um serviço do catálogo (com snapshot do preço) OU ser um item manual
  (descrição e valor livres, sem serviço). Após o lançamento ser persistido (agendamento concluído),
  o sistema NÃO MUST permitir adicionar, alterar ou remover item individual; a única mutação permitida
  sobre o lançamento passa a ser o soft delete (FR-015).
- **FR-007**: Para lançamentos com itens (receita), o valor total do lançamento MUST ser recalculado
  como a **soma exata dos valores dos itens** e essa igualdade MUST ser validada **no momento da
  captura, dentro da mesma operação atômica** que cria o lançamento; o servidor MUST rejeitar qualquer
  lançamento cujo total não bata com a soma dos itens.
- **FR-008**: O sistema MUST permitir registrar um **atendimento avulso** (walk-in): lançamento de
  receita com origem **avulso**, com itens, **sem** vínculo a agendamento.
- **FR-009**: No walk-in, o cliente MUST poder ser identificado por um cliente cadastrado, OU por um
  **nome livre**, OU por **nenhum** dos dois (anônimo). Um walk-in NÃO MUST passar pela regra de
  não-sobreposição/agenda.
- **FR-010**: O sistema MUST permitir registrar uma **despesa**: lançamento de tipo **despesa**, origem
  **despesa**, com descrição, categoria e valor, **sem** itens e **sem** cliente.
- **FR-011**: Todo valor de lançamento e de item MUST ser **positivo**; o sinal (entrada vs. saída) MUST
  derivar do **tipo** (receita/despesa), não do número. Valor zero ou negativo MUST ser rejeitado.
- **FR-012**: A **origem** (evento) e a **forma de pagamento** (meio) MUST ser tratadas como eixos
  independentes; o sistema NÃO MUST inferir uma a partir da outra. A forma de pagamento MUST ser
  opcional e aceitar, no mínimo, dinheiro, pix, cartão, online e outro.
- **FR-013**: O modelo MUST estar preparado para pagamento online (forma "online" e uma referência
  externa opcional), mas nenhum fluxo de pagamento online MUST ser ativado nesta feature; NÃO MUST
  existir status de pagamento (pendente/realizado) nem geração de receita por evento externo aqui.
- **FR-014**: O sistema NÃO MUST impor, no banco, a regra "receita exige agendamento concluído"; essa
  disciplina MUST permanecer na camada de aplicação (para permitir, no futuro, receita de online
  pré-pago antes da conclusão).
- **FR-015**: A correção de um lançamento errado MUST ser feita por **soft delete** (marcar inativo);
  o sistema NÃO MUST oferecer exclusão física nem estorno contábil como forma de correção. Um
  lançamento inativo NÃO MUST contar como dinheiro válido, mas MUST permanecer registrado para
  auditoria.
- **FR-016**: Inativar um lançamento de origem agendamento NÃO MUST reabrir/desconcluir o agendamento
  correspondente.
- **FR-017**: O momento do lançamento (`occurredAt`) MUST ser um instante informado na captura, NÃO
  derivado do fim do agendamento; MUST ser armazenado em UTC e interpretado em `America/Sao_Paulo` na
  lógica de negócio.
- **FR-018**: Todas as operações de escrita financeira (concluir/registrar/adicionar item/inativar)
  MUST exigir autorização de **OWNER**, reutilizando o guard de propriedade existente (F002); um não-
  OWNER NÃO MUST conseguir registrar ou alterar lançamentos. A verificação MUST ocorrer no servidor.
- **FR-019**: Nenhum valor monetário MUST ser hardcoded; o preço usado no snapshot MUST vir do serviço
  no momento da captura.
- **FR-020**: Esta feature NÃO MUST incluir relatórios, agregações, caixa do dia/mês, gráficos, visão
  do cliente, gateway de pagamento ou webhooks (fora de escopo — F006 e feature futura).

### Key Entities *(include if feature involves data)*

- **Lançamento (LedgerEntry)**: uma linha do razão financeiro. Representa uma entrada ou saída de
  dinheiro. Atributos essenciais: **tipo** (receita/despesa), **origem** (agendamento/avulso/despesa),
  **valor** total (sempre positivo; sinal vem do tipo), **momento** do lançamento (instante livre),
  descrição, categoria (opcional, usada em despesas), forma de pagamento (opcional), referência externa
  (opcional, sem uso agora), estado ativo/inativo (soft delete), autor (OWNER) e vínculos opcionais a
  agendamento e a cliente (cadastrado ou nome livre). Para receitas, o valor é a soma dos itens; para
  despesas, é informado diretamente e não há itens.
- **Item de Lançamento (LedgerEntryItem)**: uma linha do atendimento dentro de um lançamento de
  receita. Atributos: vínculo ao lançamento, serviço (opcional — extras manuais podem não ter serviço),
  descrição e valor (snapshot). A soma dos itens de um lançamento MUST ser igual ao valor total do
  lançamento.
- **Agendamento (Booking)**: o agendamento existente ganha um novo estado terminal **concluído**.
  Concluir dispara a geração do lançamento de receita (US1). Remarcar/cancelar (F004) passam a recusar
  agendamentos concluídos. Reusa o modelo de agendamento existente (001/002/004); a disponibilidade e a
  não-sobreposição permanecem intactas.
- **Serviço (Service)**: fonte do preço no momento do snapshot. O preço vivo pode mudar depois sem
  afetar lançamentos passados. Reusa o catálogo existente (002).
- **Cliente (Client/User)**: opcionalmente vinculado a um lançamento de receita (agendado ou walk-in).
  Um walk-in pode referenciar um cliente cadastrado, um nome livre ou ninguém. Reusa o cadastro
  existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das conclusões de agendamento ativo geram exatamente um lançamento de receita
  (origem agendamento) vinculado, com um item do serviço agendado, e nada é persistido parcialmente
  quando a operação falha.
- **SC-002**: 100% dos itens gerados na conclusão preservam o preço do momento da captura; alterar o
  preço do serviço depois altera 0% dos lançamentos já registrados.
- **SC-003**: 100% das tentativas de concluir um agendamento já concluído são recusadas, sem gerar
  lançamento duplicado.
- **SC-004**: 100% das tentativas de remarcar ou cancelar um agendamento concluído são recusadas, sem
  alterar o agendamento.
- **SC-005**: Para 100% dos lançamentos de receita, o valor total é exatamente a soma dos itens;
  divergências são rejeitadas em 100% dos casos.
- **SC-006**: 100% dos walk-ins são registrados sem tocar na agenda/disponibilidade, nos três modos de
  identificação (cadastrado, nome livre, anônimo).
- **SC-007**: 100% das despesas são registradas sem itens e sem cliente, contando como saída de dinheiro.
- **SC-008**: 100% dos lançamentos corrigidos permanecem registrados (0% de exclusão física) e deixam
  de contar como dinheiro válido; inativar um lançamento de agendamento desconclui 0% dos agendamentos.
- **SC-009**: 100% das tentativas de escrita financeira por um não-OWNER são recusadas no servidor.
- **SC-010**: 0% dos valores monetários são hardcoded; 100% dos snapshots de preço derivam do serviço
  no momento da captura.

## Assumptions

- A feature reutiliza o modelo de agendamento (001/004), o catálogo de serviços (002), o cadastro de
  clientes e o guard de propriedade `requireOwner` (002); nenhuma nova garantia de agenda/não-
  sobreposição é introduzida.
- "Valor sempre positivo, sinal vem do tipo" implica que receitas e despesas usam o mesmo campo de
  valor não-negativo; a interpretação de entrada/saída é feita pela leitura do tipo (não há valores
  negativos armazenados).
- Os "extras" (US2) são capturados como itens do mesmo lançamento de receita do atendimento,
  **exclusivamente no ato da captura** (conclusão do agendamento ou registro do walk-in), dentro da
  mesma operação atômica que cria o lançamento; adicionar extras recalcula o total como a soma dos
  itens, validada na transação. Após o agendamento atingir o estado terminal concluído, NÃO há edição
  posterior de itens — nem adicionar, nem alterar, nem remover item individual; a única mutação
  permitida sobre o lançamento é o soft delete (US5). Corrigir um lançamento errado significa inativá-
  lo por inteiro e, se necessário, registrar um novo.
- Categoria de despesa é texto livre (sem lista fechada de categorias nesta feature); a padronização/
  agregação de categorias fica para a F006.
- A forma de pagamento é opcional e informativa nesta feature; não altera o fluxo de captura nem gera
  status de pagamento.
- O soft delete de lançamento é a única forma de correção nesta feature; edição de valores de um
  lançamento existente, se oferecida, não usa exclusão física nem estorno.
- Relatórios, agregações, caixa, gráficos, visão do cliente e qualquer integração de pagamento
  (gateway/webhooks/status pendente-realizado) estão explicitamente fora de escopo (F006 e feature
  futura).
