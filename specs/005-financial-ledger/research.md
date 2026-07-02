# Research — Financeiro: Captura de Lançamentos (005)

Consolida as decisões técnicas. O modelo de dados e os pontos de integração vieram como **decisões
fechadas** no input do `/speckit-plan`; aqui registramos rationale e alternativas rejeitadas, mais a
inspeção do código existente (F002/F004) que ancora a integração.

## D1 — Chaves primárias: cuid, não IDENTITY

- **Decision**: Todas as entidades novas usam `@id @default(cuid())`.
- **Rationale**: O projeto inteiro é cuid (`User`, `Booking`, `BarbershopService`, etc. — ver
  `prisma/schema.prisma`). IDENTITY/autoincrement é convenção de OUTRO projeto do autor, não deste.
  Consistência de PK simplifica FKs e relations.
- **Alternatives rejected**: `GENERATED ALWAYS AS IDENTITY` — quebraria a homogeneidade do schema.

## D2 — Dinheiro e tempo: Decimal(10,2) e Timestamptz(6)

- **Decision**: Todo valor monetário é `Decimal @db.Decimal(10, 2)`; todo instante é `DateTime
  @db.Timestamptz(6)` em UTC.
- **Rationale**: Já é a convenção (`BarbershopService.price` é `Decimal(10,2)`; bookings usam
  `Timestamptz(6)`). Princípio II (precisão — nunca float) e Princípio VII (UTC no armazenamento).
  `occurredAt` é instante informado na captura (FR-017), **não** derivado de `Booking.endsAt`.
- **Alternatives rejected**: float/Number para dinheiro (erro de arredondamento); guardar hora local.

## D3 — `already_completed`: reason próprio e ponto de inserção na máquina de estados (F004)

- **Decision**: A recusa de concluir/remarcar/cancelar um booking `COMPLETED` usa o reason **distinto**
  `already_completed`, nunca reutilizando `not_active`/`already_cancelled`.
- **Rationale (inspeção do código — item 17)**: os dois cores da F004 usam padrões **opostos**:
  - `reschedule-booking.ts` é **allowlist**: `if (booking.status !== "ACTIVE") return not_active`.
    Um `COMPLETED` cairia no genérico `not_active` (mensagem enganosa). → Inserir
    `if (booking.status === "COMPLETED") return already_completed` **antes** do check `!== "ACTIVE"`
    (passa a ser o passo 3, entre `not_owner` e `not_active`).
  - `cancel-booking.ts` é **denylist**: `if (booking.status === "CANCELLED") return already_cancelled`,
    caso contrário **segue para o UPDATE**. Um `COMPLETED` seria **cancelado indevidamente**. → Inserir
    `if (booking.status === "COMPLETED") return already_completed` **junto** ao check
    `already_cancelled`, antes do `prisma.booking.update`.
  - Motivo de reason específico: evita renderização ambígua/ausente na UI — mesma classe do bug conhecido
    em que `no_change` não renderizava. As mensagens ficam em `reschedule-flow.tsx` (`FAILURE_MESSAGES`)
    e `my-bookings-list.tsx`; ambas ganham a chave `already_completed`.
- **Alternatives rejected**: reutilizar `not_active` (esconde a semântica "concluído" ≠ "cancelado");
  tratar só no core de conclusão (deixaria o cancel-booking cancelando um concluído).

## D4 — Autorização por role (requireOwner), não por ownership do booking

- **Decision**: Toda escrita financeira usa `requireOwner` (F002) — role `OWNER` lido do banco por
  request.
- **Rationale (item 18)**: no `Booking`, `userId` é o **CLIENTE** que agendou. A checagem da F004
  (`booking.userId === session`) autoriza o cliente, não o dono. O OWNER conclui **qualquer**
  atendimento, independente de quem agendou. `requireOwner` já lê o role do banco por request
  (`assertOwnerRole`), sem depender de claim de sessão obsoleto.
- **Alternatives rejected**: reaproveitar o guard de ownership da F004 (autorizaria a pessoa errada).

## D5 — Snapshot de preço independente de `isActive`

- **Decision**: O snapshot lê `BarbershopService.price` no ato da captura com `findUnique` **sem**
  filtrar `isActive`. Concluir um atendimento cujo serviço já foi desativado é permitido.
- **Rationale (item 7)**: a conclusão registra o que **aconteceu** (fidelidade histórica, FR-002), não
  é um novo agendamento. Diferente da F004, onde `service_inactive` só barra a **troca** para um serviço
  inativo. O valor congela no item e não muda se o preço mudar depois.
- **Alternatives rejected**: barrar serviço inativo na conclusão (perderia receita real); referenciar
  o preço vivo (violaria a fidelidade histórica).

## D6 — Atomicidade: um `$transaction` por captura; itens aninhados

- **Decision**: US1 faz `booking.update(status=COMPLETED)` + `ledgerEntry.create({ data: { …, items: {
  create: [...] } } })` no **mesmo** `prisma.$transaction`. US3/US4 criam o `LedgerEntry` (com itens
  aninhados quando houver) numa transação. A validação **total == soma dos itens** (FR-007) roda
  **dentro** da transação, sobre os valores já resolvidos (incl. snapshots).
- **Rationale**: FR-003 exige que conclusão e lançamento sejam atômicos (nunca um sem o outro). Itens
  aninhados no mesmo `create` evitam lançamento sem itens. Padrão de `$transaction` já usado na F004.
- **Alternatives rejected**: dois writes separados (janela de inconsistência); trigger no banco
  (complexidade acidental — Princípio III).

## D7 — Valor total derivado da soma dos itens (receita); sinal vem do type

- **Decision**: Para receita (BOOKING/WALK_IN), `amount` é **computado** como a soma dos `amount` dos
  itens dentro da transação (não confiando num total vindo do cliente). Despesa (EXPENSE) informa
  `amount` direto, sem itens. Todos os valores são **positivos**; entrada vs. saída vem de `type`
  (FR-011). Item de serviço usa o **snapshot** de `BarbershopService.price`; extra manual (sem serviço)
  usa valor informado (validado positivo).
- **Rationale**: FR-007 (soma bate) e FR-011 (positivo, sinal no type). Computar o total elimina a
  divergência por construção; ainda assim o servidor rejeita item com valor ≤ 0 (`invalid_amount`) e
  receita sem itens (`no_items`).
- **Alternatives rejected**: confiar no total do cliente (fonte de divergência); armazenar valores
  negativos para despesa (ambiguidade de sinal).

## D8 — `barbershopId` obrigatório, derivado no servidor (MVP barbearia única)

- **Decision**: `LedgerEntry.barbershopId` é NOT NULL, FK `Barbershop` `onDelete: Cascade`. Derivado no
  servidor: US1 herda de `booking.barbershopId`; US3 com itens de serviço herda do serviço; US3/US4 sem
  serviço resolvem a barbearia única do MVP.
- **Rationale (item 6)**: coerência com `Booking`/`BarbershopService`/`OpeningHours` (todos escopados
  por barbearia com Cascade). A F006 agregará por barbearia — plantar o campo agora evita migration
  futura. Índice `@@index([barbershopId, occurredAt])` já ajuda a F006 (item 13).
- **Alternatives rejected**: barbershopId nullable/ausente (quebra agregação futura e o padrão do
  schema).

## D9 — Dois FKs de `LedgerEntry` para `User` com relations nomeadas

- **Decision**: `clientId String?` (cliente do lançamento — relation `LedgerClient`) e `createdBy
  String` (OWNER autor — relation `LedgerCreatedBy`), ambos com `@relation` nomeada nos dois lados
  (LedgerEntry e User). Mais `clientName String?` (walk-in anônimo, FR-009).
- **Rationale (item 8)**: Prisma **exige** relations nomeadas quando há dois FKs para o mesmo model.
  Cliente e autor são papéis distintos: o cliente pode ser anônimo (nullable + nome livre); o autor é
  sempre o OWNER (NOT NULL, auditoria).
- **Alternatives rejected**: um único FK (não distingue cliente de autor); relation anônima (erro do
  Prisma com FK duplo).

## D10 — `bookingId` nullable, sem unicidade; soft delete como única correção

- **Decision**: `LedgerEntry.bookingId String?` FK `Booking`, **sem** unicidade. `isActive Boolean
  @default(true)`; corrigir = `isActive=false` (nunca hard delete nem estorno). Back-relation
  `ledgerEntries LedgerEntry[]` em `Booking`.
- **Rationale (itens 9/10, FR-015/FR-016)**: um booking pode ter 1 lançamento ativo + N inativados por
  correção — unicidade quebraria isso. Inativar não reabre o booking (FR-016): o soft delete só marca o
  lançamento; nenhuma escrita toca `Booking.status`.
- **Alternatives rejected**: `@unique(bookingId)` (impede correção-e-reemissão); hard delete (perde
  auditoria); estorno contábil (fora de escopo, complexidade).

## D11 — `COMPLETED` aditivo em `BookingStatus`; exclusion constraint intacta

- **Decision**: `enum BookingStatus { ACTIVE, CANCELLED, COMPLETED }` — valor **aditivo**. A exclusion
  constraint `booking_no_overlap` (parcial `WHERE status='ACTIVE'`) **não muda**.
- **Rationale (itens 14/15)**: ao virar `COMPLETED`, a linha sai do índice parcial naturalmente
  (libera o intervalo, coerente com o que já acontece em `CANCELLED`). É migração Prisma normal
  (`ALTER TYPE … ADD VALUE 'COMPLETED'`); a exclusion constraint continua só na migration SQL manual
  existente, sem alteração.
- **Alternatives rejected**: novo campo de estado (troca de tipo, migração não-trivial); mexer na
  constraint (desnecessário).

## D12 — `paymentMethod` e `externalRef`: eixos ortogonais e preparo online

- **Decision**: `paymentMethod PaymentMethod?` (opcional) e `externalRef String?` (sem uso agora)
  ficam no modelo, mas **nenhum** fluxo online é ativado. Sem status pendente/realizado.
- **Rationale (FR-012/FR-013)**: `origin` (evento) e `paymentMethod` (meio) são independentes — nunca
  se infere um do outro. Online futuro será apenas `paymentMethod=ONLINE` + `externalRef` do provider,
  sem tocar o schema. Manter o campo agora evita migration na feature futura.
- **Alternatives rejected**: acoplar origin↔paymentMethod; adicionar status de pagamento agora (fora de
  escopo).

## Stack (herdada, sem novidade)

- **Decision**: Reusa Next.js 16 / React 19 / Prisma 6 / NextAuth / Vitest / Luxon; nenhuma dependência
  nova. Migration via `prisma migrate dev` (sem SQL manual nesta feature).
- **Rationale**: Princípio VI (escopo) e continuidade das features 001–004.
