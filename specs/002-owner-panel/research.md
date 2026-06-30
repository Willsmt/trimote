# Phase 0 — Research: Painel do Dono

Decisões técnicas da feature 002-owner-panel. Reaproveita a fundação da 001; foco nos pontos novos.

## D1 — Autorização por `role` no servidor

- **Decision**: Adicionar enum Prisma `Role { CLIENT, OWNER }` e campo `role` em `User` com
  `@default(CLIENT)`. Criar um guard único `requireOwner()` em `src/server/auth/owner.ts` que obtém a
  sessão, carrega o `role` do usuário e lança/recusa se `role !== OWNER`. Reusado por **todas** as
  Server Actions de gestão e pela página `src/app/owner/*`.
- **Rationale**: FR-001/Princípio I — a verificação é no servidor; barrar só na UI não basta. Um guard
  único evita duplicação (DRY/Princípio III) e centraliza a regra de segurança. O default no banco
  (Princípio II) garante que todo usuário novo nasce `CLIENT`.
- **Alternatives considered**:
  - *Allowlist de e-mails por env* (default anterior da spec): rejeitada na clarificação — role no
    usuário prepara multi-barbearia futura sem reescrever a autorização.
  - *Checar role só no client/middleware*: rejeitada — viola Princípio I (precisa ser no servidor, em
    cada Server Action).
- **Promoção a OWNER**: via seed/script no MVP (sem UI de gestão de usuários) — ex.: um script que faz
  `update User set role='OWNER' where email = <env OWNER_EMAIL>` ou um seed dedicado.

## D2 — `role` na sessão vs. consulta por requisição

- **Decision**: O `requireOwner` carrega o `role` **do banco** por requisição (via `userId` da
  sessão), não confiando em um claim potencialmente obsoleto. Opcionalmente o callback de sessão pode
  expor `role`, mas a autorização de gestão revalida no banco.
- **Rationale**: Sessões em banco (001) podem ficar desatualizadas após uma promoção/rebaixamento;
  revalidar no banco é a fonte de verdade (Princípio I/II). O custo é uma consulta leve por ação.
- **Alternatives considered**:
  - *Somente claim de sessão*: rejeitada — um rebaixamento não teria efeito imediato.

## D3 — Soft delete de serviço (`isActive`)

- **Decision**: Adicionar `isActive Boolean @default(true)` a `BarbershopService`. "Remover" um serviço
  com agendamentos ativos futuros = `isActive = false` (nunca delete físico). A listagem pública
  (`listServices`, 001) passa a filtrar `where: { isActive: true }`.
- **Rationale**: FR-005/FR-006 — preserva histórico e os agendamentos existentes (que referenciam o
  serviço por FK). Delete físico violaria a FK e a integridade (Princípio II).
- **Alternatives considered**:
  - *Delete físico + cascade*: rejeitada — apagaria/zumbificaria bookings históricos.
  - *Permitir delete só se não houver bookings*: parcialmente válido, mas o comportamento uniforme
    (sempre desativar) é mais simples e seguro; o MVP adota desativação sempre.
- **Reativação**: um serviço inativo pode voltar a `isActive = true` (reativar), respeitando a
  unicidade de nome entre ativos (D4).

## D4 — Unicidade de nome entre serviços ativos (índice parcial)

- **Decision**: Garantir no banco que dois serviços **ativos** não tenham o mesmo nome via **índice
  único parcial**: `CREATE UNIQUE INDEX ... ON "BarbershopService"(name) WHERE "isActive" = true` —
  por **migration SQL manual** (o Prisma não expressa índice único parcial no `schema.prisma`).
- **Rationale**: FR-012/FR-013/Princípio II — a unicidade é propriedade do armazenamento, não só da
  app. Parcial em `isActive` permite reusar o nome de um serviço antigo desativado.
- **Alternatives considered**:
  - *`@@unique([name])` no schema*: rejeitada — bloquearia reusar nome de serviço desativado e não é
    parcial.
  - *Só validação na aplicação*: rejeitada — sofre condição de corrida (Princípio II).
- **Tradução do erro**: a violação do índice (SQLSTATE `23505`, unique) é capturada no core e traduzida
  em recusa de negócio `name_taken` (analogamente à tradução de erro da 001).

## D5 — Edição que afeta bookings (proteção por design)

- **Decision**: **Não** recalcular `endsAt` de bookings existentes ao editar a duração de um serviço.
  O `Booking` já materializa `endsAt` no momento da reserva (decisão D8 da 001), então bookings já
  estão protegidos por design. Editar duração afeta só agendamentos futuros (que materializarão o novo
  valor na criação).
- **Rationale**: FR-007 — consistência histórica sem efeitos colaterais retroativos. Confirmar, não
  implementar recálculo.
- **Alternatives considered**:
  - *Recalcular endsAt retroativamente*: rejeitada — alteraria reservas já feitas (e poderia violar a
    exclusion constraint de não-sobreposição da 001).

## D6 — Mudança de expediente não cancela bookings

- **Decision**: Editar/fechar um dia de expediente altera **apenas** o cálculo de disponibilidade
  futura (domínio puro `computeAvailableSlots` da 001, que lê `OpeningHours`). Bookings já gravados não
  são tocados nem cancelados.
- **Rationale**: FR-011 — a disponibilidade é derivada em tempo de consulta; mudar `OpeningHours` muda
  só a oferta futura. Nenhuma escrita em `Booking`.
- **Alternatives considered**:
  - *Cancelar bookings fora do novo expediente*: rejeitada — fora de escopo e destrutivo.

## D7 — Validação de input (serviço e expediente)

- **Decision**: Validar no servidor (core de gestão): nome não vazio, `price >= 0` (Decimal),
  `durationMinutes > 0`; expediente com `closesAtMinutes > opensAtMinutes`. Recusas retornam `reason`
  estruturado, sem vazar detalhe (Princípio I/III). Reforço opcional no banco via `CHECK`.
- **Rationale**: FR-003/FR-009 — entradas inválidas recusadas sem persistir.

## D8 — Testes (Princípio IV)

- **Decision**: Test-first para (a) o **guard `requireOwner`** — não-dono e visitante barrados no
  servidor (integração, pois depende de sessão/role no banco) — e (b) a **regra de soft-delete e
  preservação de booking** — desativar serviço com booking ativo preserva o booking; índice parcial
  rejeita nome duplicado entre ativos mas permite reusar nome de inativo.
- **Rationale**: são a lógica crítica de segurança e integridade da feature.
- **Alternatives considered**:
  - *Mockar Prisma para o guard/constraints*: rejeitada — não exercita a regra real (role no banco,
    índice parcial).

## Unknowns resolvidos

Nenhum `NEEDS CLARIFICATION` pendente (o modelo de autorização foi fixado na clarificação). Pontos de
implementação (nome do índice, script de promoção) ficam para tasks/implementação.
