# Research: Multi-tenancy — Negócios, Donos e Administração (F007)

Decisões técnicas (todas fechadas pelo usuário ou derivadas das clarificações). A feature toca os
cores de F001–F006; a **regressão dos 139 testes** é o gate entre as etapas.

---

## D1 — Rename por `ALTER TABLE RENAME` (migration 1, hand-edited)

**Decision**: a migration 1 é criada com `prisma migrate dev --create-only` e o SQL é **editado à
mão** para usar `ALTER TABLE "Barbershop" RENAME TO "Business"`,
`ALTER TABLE "BarbershopService" RENAME TO "Service"`, e `ALTER TABLE … RENAME COLUMN "barbershopId"
TO "businessId"` em `Booking`, `OpeningHours`, `Service` (o `barbershopId` do índice/FK) e
`LedgerEntry`. Acrescenta `ALTER TABLE "Business" ADD COLUMN "segment" text NOT NULL DEFAULT
'barbershop'`. O `schema.prisma` é atualizado para os novos nomes (com `@@map`/`@map` apenas se
necessário para casar o estado do banco).

**Rationale**: o Postgres preserva **dados, índices, FKs e a exclusion constraint** num rename; o
gerador do Prisma, ao ver um model renomeado, emite **DROP + CREATE** (perda total). Hand-edit é a
única via segura (Princípio II).

**Alternatives considered**: deixar o Prisma gerar → destrói dados e recria `booking_no_overlap`
(risco de perder a semântica). Rejeitado.

**Gate pós-M1**: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname =
'booking_no_overlap'` deve mostrar a definição referenciando **`businessId`**; `npm test` = **139
verdes** antes de tocar a M2.

---

## D2 — Rename atinge o **código inteiro** (parte da onda 1, zero lógica)

**Decision**: o rename do schema muda a API do Prisma Client (`prisma.barbershop`→`prisma.business`,
`prisma.barbershopService`→`prisma.service`, campos `barbershopId`→`businessId`). Toda referência em
**cores, actions, pages e fixtures** é renomeada na **mesma onda**, **sem mudança de comportamento**.
O critério de conclusão da onda 1 é: `tsc` limpo + **139 testes verdes** com os novos nomes.

**Rationale**: a onda 1 tem que deixar o sistema idêntico em comportamento, só com nomes novos — é o
que torna a regressão um **bissector** limpo (qualquer vermelho na onda 1 = erro de rename, não de
lógica).

---

## D3 — `BusinessMember` (vínculo N:N) e enum `BusinessRole`

**Decision**: `model BusinessMember { id (cuid), userId FK→User, businessId FK→Business, role
BusinessRole, createdAt Timestamptz, createdBy FK→User, @@unique([userId, businessId]) }`. Enum
`BusinessRole { OWNER }` — **nasce só com OWNER**; adicionar `STAFF` no futuro é aditivo. Relations
**nomeadas** para as duas FKs a `User` (o membro vs. quem promoveu — mesmo cuidado da F005
`LedgerClient`/`LedgerCreatedBy`).

**Rationale**: N:N por tabela de membros é o modelo pedido; `@@unique` torna vínculo duplicado
**impossível no dado** (Princípio II), não uma checagem de app. `createdBy`+`createdAt` = auditoria
mínima (FR-009).

---

## D4 — `OWNER` sai da autoridade do `Role` global (valor de enum permanece)

**Decision**: a **fonte de verdade da posse** passa a ser `BusinessMember`. `requireOwner` consulta o
vínculo (não `User.role`). `Role` ganha `ADMIN` (aditivo). O **backfill** cria o `BusinessMember` do
OWNER atual e **rebaixa** o `User.role` desses usuários para `CLIENT`. O valor `OWNER` **permanece no
enum** (sem uso) — remoção física fica como cleanup futuro.

**Rationale (prós de OWNER sair da autoridade)**: fonte única de verdade (sem dual-write/drift entre
`User.role` e membership); `requireOwner` semanticamente correto (posse é **por negócio**). **Contra
remover o valor agora**: Postgres não tem `ALTER TYPE DROP VALUE`; removê-lo exige recriar o tipo e
recastar a coluna — a operação mais arriscada possível, sem ganho funcional. Manter o valor sem uso é
o equilíbrio (Princípio VI: escopo disciplinado; risco mínimo).

**Alternatives considered**: (a) manter OWNER como marcador global co-autoritativo → dual source of
truth, risco de drift, rejeitado; (b) remover fisicamente o valor agora → migração de tipo arriscada,
adiada.

---

## D5 — Negócio ativo = `Session.activeBusinessId` (server-side)

**Decision**: coluna `activeBusinessId String?` em `Session` (FK→Business, `onDelete: SetNull`). O
switch é uma Server Action que lê o `sessionToken` do cookie, **valida membership** do alvo e grava
`activeBusinessId`. `getActiveBusiness()` (server) resolve a sessão, lê `activeBusinessId`,
**revalida membership por request** e devolve o business — ou aciona seleção/auto/vazio conforme o nº
de vínculos.

**Rationale**: é o mais **server-side** possível (o client só carrega o `sessionToken` opaco; o
negócio ativo vive na row do banco). Revalidação por request garante que, mesmo se o vínculo for
removido, a próxima operação não vaza. NextAuth (database sessions) já lê a row por request; adicionar
uma coluna nullable não interfere no PrismaAdapter (ele só escreve seus campos; a rotação de `expires`
preserva as demais colunas).

**Alternatives considered**: cookie httpOnly separado (`active-business`) — client-transportável
(httpOnly limita JS, não o envio); seguro **só** com revalidação, mas menos fiel a "estado de sessão
no servidor". Rejeitado como primário, aceitável como fallback. **`businessId` por parâmetro de
request** = a porta de IDOR que a US3/FR-014 proíbem — rejeitado.

**Edge**: 0 negócios → `getActiveBusiness()` devolve "sem negócio" e as telas de dono mostram estado
vazio orientando contato com o ADMIN (sem erro). 1 negócio → auto-seleciona (seletor oculto).

---

## D6 — Anti-escalação de privilégio (5 camadas)

**Decision**: exatamente as 5 camadas do briefing —
1. **Sem caminho**: nenhuma Server Action pública escreve `User.role` nem cria `BusinessMember`;
   promoção existe **só** na área ADMIN.
2. **Do banco por request**: `requireAdmin` lê `User.role` do banco; `requireOwner` valida
   `BusinessMember(sessão, negócio ativo, OWNER)`. Nunca de cookie/JWT/input (estende o padrão da
   F002/F003 de ler role do banco por request).
3. **ADMIN só promove a OWNER**: não existe action "promover a ADMIN"; o 2º ADMIN é seed/script
   manual documentado (blast radius mínimo).
4. **Horizontal**: `businessId` da sessão + revalidação (D5); nas superfícies públicas, do slug.
5. **ADMIN ≠ operador**: `requireAdmin` não concede acesso a caixa/ledger/painel de terceiros; só
   `requireOwner` (membership) concede. Um ADMIN que também é membro opera esse negócio.

**Rationale**: replica e estende a disciplina anti-IDOR do `clientId` da F006 para o eixo de negócio
(horizontal) e adiciona o eixo de privilégio (vertical). Princípio I.

**Testável**: CLIENT chama action de admin → recusado; OWNER de A tenta operar B → recusado (o
parâmetro sequer existe); não há símbolo/rota "promover a ADMIN".

---

## D7 — Slug: origem, validação e reservados (Clarify #3)

**Decision**: o ADMIN informa o slug no form, **pré-preenchido** por derivação do nome (kebab-case,
sem acentos), **editável**. Validação **no servidor** em `admin-create-business`:
`^[a-z0-9]+(-[a-z0-9]+)*$`, **unicidade** (`Business.slug @unique` + checagem), e **lista de
reservados**: `admin, api, b, booking, owner, login, my-bookings, my-spending` (rotas do app não
podem virar slug — senão `/b/[slug]` colidiria conceitualmente com áreas do app). Imutável pela UI
pós-criação.

**Rationale**: derivação reduz erro do ADMIN; a validação server-side é a barreira real (Princípio
I). Reservados evitam slugs que confundam roteamento/segurança.

---

## D8 — Estratégia de fixtures / regressão (item 15)

**Decision**:
- **Onda 1 (rename)**: as fixtures existentes (`BARBERSHOP_ID = "barbershop-trimote"`,
  `prisma.barbershopService`, `barbershopId`) são renomeadas mecanicamente
  (`BUSINESS_ID`/`prisma.service`/`businessId`), mantendo **um** business. Os 139 continuam verdes.
- **Onda 2 (funcional)**: as fixtures que semeiam o dono passam a criar também o **BusinessMember**
  (o owner de teste é membro OWNER do business de teste), e os cores/actions de dono derivam o
  `businessId` do negócio ativo. Um **segundo business fixture** (+ segundo owner) é adicionado para
  os testes de **isolamento** (A×B) e anti-escalação. As 139 suites existentes **não** são
  enfraquecidas — no máximo ganham o membership no setup.

**Rationale**: o rename é bissector limpo (139 verdes provam "só nomes"); o segundo business é o que
permite provar o não-vazamento (SC-001). "Regressão como design" (FR-025/SC-006).

---

## D9 — `requireOwner` redefinido, `requireAdmin` novo

**Decision**: `requireAdmin()` — sessão + `User.role === ADMIN` (lido do banco); usado por `/admin` e
pelas actions de administração. `requireOwner()` — sessão + `getActiveBusiness()` + confirma que o
usuário é **membro OWNER** daquele business; devolve `{ user, businessId }`. As actions de dono
passam a usar o `businessId` retornado (nunca de input). O guard antigo `assertOwnerRole` (que lia
`User.role === OWNER`) é substituído pela checagem de membership.

**Rationale**: um guard por eixo (plataforma vs. negócio), ambos server-side e do banco. Mantém o
padrão "guard único por superfície" das features anteriores.

---

## D10 — Escopo por negócio nos cores já parametrizados

**Decision**: os cores financeiros (`cash-summary`, `ledger-list`, `client-history`,
`complete-booking`, `register-*`) e de booking já **recebem** `barbershopId`/`serviceId` por
parâmetro (a F006 isolou por barbearia). Na F007: (a) renomear o parâmetro para `businessId` (onda 1);
(b) a **origem** do `businessId` muda de `findFirstOrThrow` p/ `getActiveBusiness()` nas actions
(onda 2). `client-history` (US5) passa a **incluir o nome do negócio** por item no select/DTO.

**Rationale**: minimiza reescrita — a fundação de isolamento por id já existe; a F007 troca a
**fonte** do id (de "a única" para "a ativa da sessão") e adiciona o rótulo de negócio ao cliente.

---

## D11 — Bootstrap do primeiro ADMIN (documentado)

**Decision**: seed/script idempotente que promove a conta do operador (`willmarthins@gmail.com`) a
`Role.ADMIN` — a **única** elevação feita fora da plataforma. Documentado no README e no
`prisma/seed`. A partir dele, toda administração é via `/admin` (US1).

**Rationale**: alguém precisa ser o primeiro ADMIN; não há como criá-lo pela própria plataforma sem
abrir um caminho de self-service (proibido). Manual + documentado + idempotente = blast radius
mínimo (FR-020/FR-022-bootstrap).

---

## Testes obrigatórios (perfil da feature — item 14)

- **Guards**: `requireAdmin` (não-ADMIN recusado), `requireOwner` (não-membro recusado; membro OWNER
  do negócio ativo admitido).
- **Anti-escalação**: CLIENT chama action de admin → recusado; OWNER de A opera B → recusado;
  inexistência de "promover a ADMIN"; nenhuma action pública escreve `User.role`/`BusinessMember`.
- **Slug**: formato inválido, duplicado e reservado → recusados; válido → criado.
- **Backfill**: pós-migrations, contagem e vínculo de bookings/lançamentos/serviços idênticos; owner
  atual com membership; operador ADMIN.
- **Isolamento por negócio**: booking de A **não** conflita com B (exclusion particiona); caixa/razão
  de A **não** somam/listam dados de B; histórico do cliente rotula o negócio.
- **Regressão**: 139 verdes pós-M1 (rename) e pós-M2 (funcional).
