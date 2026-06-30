# Feature Specification: Painel do Dono — Gerenciar Serviços e Horários

**Feature Branch**: `002-owner-panel`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "painel do dono para gerenciar serviços e horários"

## Clarifications

### Session 2026-06-29

- Q: Como o dono é autorizado a acessar o painel? → A: Por um campo `role` no usuário (enum
  `CLIENT | OWNER`, default `CLIENT`), com verificação de role **no servidor** em toda operação de
  gestão. A promoção a `OWNER` é feita via seed/script no MVP (sem UI de gestão de usuários nesta
  feature). Esse modelo prepara o caminho para multi-barbearia futura sem reescrever a autorização.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerenciar serviços (Priority: P1)

O dono, autenticado e autorizado, acessa o painel e gerencia o catálogo de serviços: cria um novo
serviço (nome, preço, duração), edita um existente e desativa/remove um que não oferece mais — sem
quebrar agendamentos já existentes que usaram aquele serviço.

**Why this priority**: É a razão central do painel — hoje os serviços são dados pré-cadastrados
(seed) e só mudam por intervenção técnica. Dar autonomia ao dono sobre o catálogo é o maior valor.

**Independent Test**: Autenticar como dono, criar um serviço, vê-lo aparecer na listagem pública de
serviços; editar preço/duração e ver a mudança refletida; desativar um serviço e confirmar que ele
some da listagem pública sem afetar agendamentos passados.

**Acceptance Scenarios**:

1. **Given** o dono autenticado, **When** cria um serviço com nome, preço e duração válidos, **Then**
   o serviço passa a existir e aparece para os clientes na lista de serviços.
2. **Given** um serviço existente, **When** o dono edita nome, preço ou duração, **Then** a alteração
   é persistida e refletida na listagem; agendamentos já criados mantêm a duração que tinham.
3. **Given** um serviço com agendamentos ativos futuros, **When** o dono tenta removê-lo, **Then** o
   sistema impede a remoção física e oferece desativá-lo (o serviço some da oferta, mas o histórico e
   os agendamentos existentes são preservados).
4. **Given** dados inválidos (preço negativo, duração ≤ 0, nome vazio), **When** o dono tenta salvar,
   **Then** o sistema recusa com mensagem clara e nada é persistido.

---

### User Story 2 - Gerenciar horário de funcionamento (Priority: P2)

O dono define o horário de funcionamento por dia da semana: abertura e fechamento de cada dia, ou
marca o dia como fechado. A disponibilidade oferecida aos clientes passa a refletir essas regras.

**Why this priority**: Complementa o controle do catálogo; permite ajustar o expediente (feriados
recorrentes, folga semanal) sem intervenção técnica. Depende do mesmo acesso autorizado da US1.

**Independent Test**: Autenticar como dono, alterar o horário de um dia (ex.: fechar às 17:00 em vez
de 18:00) e confirmar que a disponibilidade daquele dia para os clientes passa a respeitar o novo
fechamento; marcar um dia como fechado e confirmar que nenhum horário é oferecido nele.

**Acceptance Scenarios**:

1. **Given** o dono autenticado, **When** define abertura e fechamento de um dia com `fechamento >
   abertura`, **Then** a regra é salva e a disponibilidade dos clientes passa a usá-la.
2. **Given** um dia de funcionamento, **When** o dono marca o dia como fechado, **Then** nenhum
   horário livre é oferecido nesse dia.
3. **Given** valores inválidos (`fechamento ≤ abertura`), **When** o dono tenta salvar, **Then** o
   sistema recusa com mensagem clara e nada é persistido.
4. **Given** agendamentos ativos que ficam fora do novo expediente, **When** o dono reduz o horário,
   **Then** os agendamentos existentes são preservados (não são cancelados automaticamente) e apenas
   a oferta de novos horários muda.

---

### User Story 3 - Acesso restrito ao painel (Priority: P3)

Apenas o dono autorizado acessa o painel e suas operações. Um cliente comum autenticado, ou um
visitante, não consegue ver nem executar nenhuma ação de gestão.

**Why this priority**: É a barreira de segurança que protege as US1/US2. Tem valor próprio
(impede gestão indevida do catálogo/expediente) e é independentemente testável.

**Independent Test**: Tentar acessar o painel e as operações de gestão como (a) visitante não
autenticado e (b) cliente comum autenticado — ambos são barrados; como dono autorizado, o acesso é
concedido.

**Acceptance Scenarios**:

1. **Given** um visitante não autenticado, **When** tenta acessar o painel ou uma operação de gestão,
   **Then** o acesso é negado (exige autenticação).
2. **Given** um cliente comum autenticado (não-dono), **When** tenta acessar o painel ou uma operação
   de gestão, **Then** o acesso é negado.
3. **Given** o dono autorizado, **When** acessa o painel, **Then** o acesso é concedido e ele vê as
   ferramentas de gestão.

---

### Edge Cases

- **Remoção de serviço em uso**: um serviço com agendamentos ativos futuros não pode ser removido
  fisicamente; só desativado (preserva histórico e agendamentos — alinhado à integridade de dados).
- **Edição de duração**: alterar a duração de um serviço afeta apenas agendamentos futuros; os já
  criados mantêm a duração vigente no momento da reserva.
- **Redução de expediente com agendamentos existentes**: agendamentos fora do novo horário são
  preservados; apenas a oferta de novos horários muda.
- **Unicidade de nome de serviço**: dois serviços ativos não devem ter o mesmo nome (evita confusão
  do cliente).
- **Autorização**: toda operação de gestão é verificada no servidor; barrar na interface não basta.
- **Concorrência na edição**: duas edições simultâneas do mesmo serviço/dia não devem corromper o
  dado (a última gravação consistente prevalece, sem estado parcial).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST restringir todas as operações do painel a usuários com `role = OWNER`;
  visitantes e usuários com `role = CLIENT` MUST ser barrados. A verificação de role MUST ocorrer
  **no servidor** em toda operação de gestão (barrar apenas na interface não basta).
- **FR-001a**: Todo usuário MUST ter um `role` com default `CLIENT`; a promoção a `OWNER` MUST ser
  feita via seed/script no MVP (não há UI de gestão de usuários nesta feature).
- **FR-002**: O dono MUST poder criar um serviço informando nome, preço e duração.
- **FR-003**: O sistema MUST validar os dados do serviço: nome não vazio, preço ≥ 0 e duração > 0;
  entradas inválidas MUST ser recusadas sem persistir.
- **FR-004**: O dono MUST poder editar nome, preço e duração de um serviço existente.
- **FR-005**: O sistema MUST impedir a remoção física de um serviço que possua agendamentos ativos
  futuros, oferecendo a **desativação** como alternativa.
- **FR-006**: Um serviço desativado MUST deixar de aparecer na oferta aos clientes, **sem** apagar o
  serviço nem afetar agendamentos já existentes.
- **FR-006a**: O dono MUST poder reativar um serviço inativo (transição INACTIVE → ACTIVE). A operação
  MUST ser restrita a `role = OWNER` e verificada no servidor; a reativação MUST respeitar a unicidade
  de nome entre serviços ativos (ver FR-012).
- **FR-007**: Editar a duração de um serviço MUST afetar apenas agendamentos futuros; agendamentos já
  criados MUST manter a duração vigente no momento da reserva.
- **FR-008**: O dono MUST poder definir, por dia da semana, o horário de abertura e fechamento, ou
  marcar o dia como fechado.
- **FR-009**: O sistema MUST validar que `fechamento > abertura`; valores inválidos MUST ser
  recusados sem persistir.
- **FR-010**: As mudanças de horário de funcionamento MUST passar a reger a disponibilidade oferecida
  aos clientes a partir de sua gravação.
- **FR-011**: Reduzir o expediente ou marcar um dia como fechado MUST NOT cancelar automaticamente
  agendamentos já existentes; apenas a oferta de novos horários muda.
- **FR-012**: O sistema MUST garantir a unicidade de nome entre serviços ativos.
- **FR-013**: O sistema MUST registrar/garantir a integridade no nível de dados para as regras de
  unicidade e de não-remoção de serviços em uso (não apenas na camada de aplicação).
- **FR-014**: O sistema MUST apresentar mensagens de erro claras ao dono em caso de recusa, sem
  vazar detalhes sensíveis.

### Key Entities *(include if feature involves data)*

- **Dono (Owner)**: usuário autorizado a gerenciar o catálogo e o expediente. Distingue-se do cliente
  comum por um campo `role` (enum `CLIENT | OWNER`, default `CLIENT`) no próprio usuário; a promoção a
  `OWNER` é feita via seed/script. É o único ator desta feature. O campo de role abre caminho para
  multi-barbearia futura sem reescrever a autorização.
- **Serviço (BarbershopService)**: entidade já existente (nome, preço, duração). Esta feature adiciona
  o ciclo de vida gerenciado pelo dono (criar/editar/desativar) e um estado **ativo/inativo** para
  permitir desativação sem perda de histórico.
- **Horário de Funcionamento (OpeningHours)**: entidade já existente (abertura/fechamento por dia da
  semana; ausência = fechado). Esta feature permite ao dono editá-la.
- **Agendamento (Booking)**: entidade já existente; não é gerenciada aqui, mas é **protegida** pelas
  regras (não pode ser quebrada por remoção de serviço ou mudança de horário).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0% de operações de gestão bem-sucedidas por não-donos (nenhum visitante ou cliente comum
  consegue criar/editar/remover serviço ou alterar horário).
- **SC-002**: 100% das mudanças de catálogo feitas pelo dono refletem na listagem pública de serviços
  imediatamente após salvar.
- **SC-003**: 100% das mudanças de horário feitas pelo dono regem a disponibilidade oferecida aos
  clientes a partir da gravação.
- **SC-004**: 0% de agendamentos existentes cancelados/quebrados por remoção de serviço ou redução de
  expediente (histórico e reservas preservados).
- **SC-005**: 0% de serviços ativos duplicados por nome.
- **SC-006**: O dono consegue criar ou editar um serviço em menos de 1 minuto.

## Assumptions

- **Modelo de autorização do dono** (decidido — ver Clarifications): o dono é identificado por um campo
  `role` (enum `CLIENT | OWNER`, default `CLIENT`) no usuário, verificado **no servidor** em toda
  operação de gestão, reutilizando o login Google existente. A promoção a `OWNER` é feita via
  seed/script no MVP (sem UI de gestão de usuários). Escolhido por preparar multi-barbearia futura sem
  reescrever a autorização.
- **Escopo único**: mantém-se o pressuposto do MVP de **uma barbearia e um recurso**; o painel
  gerencia o catálogo e o expediente dessa barbearia.
- **Desativação vs. remoção**: a "remoção" de um serviço em uso é, na prática, uma **desativação**
  (soft delete), preservando agendamentos e histórico.
- **Sem fila de aprovação/auditoria**: as mudanças do dono têm efeito imediato; não há trilha de
  auditoria nem aprovação por terceiros neste escopo.
- **Múltiplas janelas por dia**: mantém-se uma janela contínua por dia (como no MVP); intervalos
  (ex.: pausa de almoço) ficam fora deste escopo.

## Out of Scope

- Gestão de múltiplas barbearias ou múltiplos profissionais/cadeiras.
- Trilha de auditoria, histórico de alterações ou aprovação de mudanças.
- Exceções de calendário por data específica (feriados pontuais) — apenas o expediente por dia da
  semana.
- Múltiplas janelas de funcionamento no mesmo dia (ex.: manhã e tarde com pausa).
- Relatórios, métricas de negócio ou faturamento.
- Gestão de clientes ou de agendamentos pelo dono (cancelar/remarcar reservas de clientes).
