# Research: Remarcar Agendamento (004-reschedule-booking)

Decisões técnicas consolidadas. Sem `NEEDS CLARIFICATION` pendente (a única ambiguidade de produto —
"mesmo horário" — foi resolvida em clarify: recusa amigável).

## D1 — Exclude-self na disponibilidade: na query, não na função pura (FR-002/FR-004)

- **Decisão**: adicionar um parâmetro **opcional** `excludeBookingId` à Server Action
  `getAvailableSlots` (`src/server/actions/get-available-slots.ts`). Quando presente, a busca de
  `activeBookings` ganha `id: { not: excludeBookingId }` no `where`. O domínio puro
  `computeAvailableSlots` permanece **inalterado**.
- **Rationale**: `computeAvailableSlots` recebe `activeBookings: BookingInterval[]` onde
  `BookingInterval = { startsAt, endsAt }` — **não** conhece ids de booking. Filtrar dentro da função
  pura exigiria adicionar `id` ao tipo e misturar identidade de booking numa função de geometria de
  horários (pior pelo Princípio III). Excluir na **query** é o ponto mais limpo, mantém a função pura
  intacta e ainda é um **único** toque na 001 (a action, que já faz o fetch). Backward compatible: o
  fluxo de agendar (`booking-flow`) não passa o parâmetro e continua idêntico.
- **Refinamento do input**: o pedido sugeria o parâmetro em `computeAvailableSlots`; o efeito desejado
  (o próprio agendamento não conta como conflito) é idêntico, mas posicionado na query para não poluir
  o domínio puro. Sinalizado no plano para revisão.
- **Correção**: ao mover dentro do **mesmo dia**, o booking sendo movido está no conjunto buscado e,
  sem a exclusão, bloquearia o próprio horário atual e janelas adjacentes. Ao mover para **outro dia**,
  o self-booking não está no conjunto do dia-alvo e a exclusão é inócua — correto em ambos os casos.
- **Alternativas consideradas**:
  - Param em `computeAvailableSlots` + `id` em `BookingInterval` → rejeitado (polui o domínio puro).
  - Nova action de disponibilidade dedicada à remarcação → rejeitado (duplica a orquestração de fetch
    de expediente + bookings que `getAvailableSlots` já faz).

## D2 — Mover atômico: UPDATE da mesma linha em transação (FR-001/FR-003/FR-006)

- **Decisão**: remarcar é um `prisma.$transaction` com um `update` da **mesma** `Booking`
  (`serviceId`, `startsAt`, `endsAt`), recalculando `endsAt = startsAt + service.durationMinutes`. A
  exclusion constraint `booking_no_overlap` (parcial em `status='ACTIVE'`) garante a não-sobreposição
  com **outros** bookings ativos; a violação `23P01` é capturada e traduzida em `slot_unavailable`,
  reusando a mesma deteção de `createBooking` (`isExclusionViolation`: SQLSTATE `23P01` ou nome
  `booking_no_overlap`).
- **Rationale**: manter a identidade do agendamento (FR-001) e a garantia de integridade no banco
  (Princípio II). Mover a própria linha **não** conflita consigo mesma (é uma única linha sendo
  atualizada — o range antigo deixa de existir no mesmo comando). Liberar o horário antigo é
  **automático**: a disponibilidade é derivada dos bookings ativos (FR-003), sem passo extra.
- **Alternativas consideradas**:
  - Cancelar + criar novo → rejeitado: perde a identidade (FR-001) e exigiria coordenação de dois
    registros.

## D3 — Recusa "mesmo horário e serviço": checagem de aplicação `no_change` (FR-012)

- **Decisão**: antes do UPDATE, comparar `(novo serviceId, novo startsAt)` com o `(serviceId,
  startsAt)` atual do booking. Se idênticos (sem mudança real), recusar de forma amigável com
  `reason: "no_change"`, informando que já é o horário/serviço atual — **sem** UPDATE.
- **Rationale**: "mesmo horário" é **ausência de mudança**, não um conflito de sobreposição; a
  exclusion constraint nem dispararia (é a própria linha). A decisão de produto (clarify 2026-06-30) é
  recusar amigavelmente para o cliente não achar que remarcou quando nada mudou. É uma regra de
  aplicação explícita, testável isoladamente.
- **Nota**: trocar **só** o serviço mantendo o horário, ou só o horário, **não** é `no_change` (há
  mudança real) e segue o fluxo normal de disponibilidade/UPDATE.

## D4 — Ownership e elegibilidade no servidor (FR-007/FR-008/FR-010)

- **Decisão**: o core `rescheduleBookingForUser({ userId, bookingId, serviceId, startsAt, now? })`
  valida, antes de qualquer escrita: existência (`not_found`), propriedade (`booking.userId === userId`
  senão `not_owner`), status ativo (`status === 'ACTIVE'` senão `not_active`) e que o booking ainda é
  **futuro** (`booking.startsAt > now` senão `booking_in_past`). A Server Action fina deriva `userId`
  de `requireUser` (padrão do `cancelBooking`).
- **Rationale**: reusa o padrão de ownership já validado da 001/002 (verificação no servidor, nunca só
  na UI). Recusas não movem o agendamento (FR-009).
- **Alternativas consideradas**: confiar na UI para esconder o botão "Remarcar" → rejeitado como única
  barreira (Princípio I); a UI esconde por conveniência, o servidor é a barreira.

## D5 — Revalidação de horário/expediente no servidor (FR-002/FR-004/FR-005)

- **Decisão**: o core revalida, com a mesma lógica do `createBooking`: alvo no passado →
  `in_the_past` (FR-005); o serviço escolhido deve caber na janela de expediente do dia (no fuso da
  barbearia) senão `outside_opening_hours` (FR-004). `endsAt` é materializado a partir da duração do
  serviço escolhido.
- **Rationale**: a disponibilidade mostrada na UI é conveniência; o servidor revalida de forma
  autoritativa (defesa em profundidade, Princípio I), no fuso `America/Sao_Paulo` (Princípio VII).
- **Regra de serviço inativo (clarify 2026-06-30)**: ao **trocar** de serviço
  (`serviceId !== booking.serviceId`), o core reforça `isActive` do serviço escolhido — inativo →
  `service_inactive` (FR-014). Ao **manter** o serviço atual (`serviceId === booking.serviceId`), o
  core NÃO checa `isActive`, mesmo que o serviço tenha ficado inativo — preserva o agendamento
  existente e permite apenas mover o horário. Isso **diverge** intencionalmente do `createBooking`
  (que não reforça `isActive`), mas é local ao core novo: `createBooking`/`computeAvailableSlots`
  permanecem intocados (Princípio VI mantido). O spec trata "apenas serviços ativos ofertáveis" como
  barreira de servidor na troca, não só de UI.

## D6 — Test-first (Princípio IV)

- **Decisão**: escrever testes falhando antes de implementar, em `tests/integration/reschedule/`:
  1. **exclude-self**: `getAvailableSlots` com `excludeBookingId` não oferta nem bloqueia o próprio
     horário/adjacências do booking movido.
  2. **conflito concorrente**: alvo ocupado por outro booking ativo → `23P01 → slot_unavailable`, sem
     mover o agendamento original.
  3. **no_change**: mesmo serviço+horário → `no_change`, sem UPDATE.
  4. **ownership/elegibilidade**: `not_owner`, `not_active`, `booking_in_past`, `in_the_past`.
  5. **mover + liberar**: sucesso → mesma identidade no novo horário; horário antigo volta a ser
     ofertado como livre.
- **Rationale**: conflito/disponibilidade é o núcleo de corretude do produto (Princípio IV
  não-negociável). São testes de integração porque a garantia vive no banco (exclusion constraint) e o
  exclude-self vive na query.

## D7 — Sem migration

- **Decisão**: nenhuma mudança de schema. Remarcar usa colunas existentes (`serviceId`, `startsAt`,
  `endsAt`, `status`) da `Booking`. A exclusion constraint e os índices da 001 cobrem a garantia.
- **Rationale**: a feature é comportamento sobre o modelo existente; adicionar schema seria escopo
  desnecessário (Princípio VI).
