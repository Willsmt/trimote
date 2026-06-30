# Phase 1 — Contracts: Server Actions do Painel do Dono

Interface de servidor da 002. Todas as ações de gestão são **Server Actions** que chamam o guard
`requireOwner` antes de qualquer efeito (FR-001/Princípio I). Entradas validadas no servidor; retornos
de negócio usam envelope `{ ok: false, reason }` sem vazar detalhe interno.

Convenções:

- **Auth/role**: toda ação abaixo exige sessão **e** `role = OWNER` (via `requireOwner`). Sem isso ⇒
  recusa não-autorizado (`unauthorized`/`forbidden`).
- **Core testável**: cada action é wrapper fino sobre um core em `src/server/owner/` (padrão da 001).

---

## `requireOwner()` (guard, não é Server Action exposta)

- Obtém a sessão; carrega `role` do usuário no banco (D2). Se não autenticado ⇒ `UnauthorizedError`;
  se `role !== OWNER` ⇒ `ForbiddenError`. Retorna o usuário dono caso ok.

---

## Serviços (US1)

### `createService(input)`

- **Input**: `{ name: string, price: string /* decimal */, durationMinutes: number }`.
- **Output**: `{ ok: true, serviceId } | { ok: false, reason }`.
- **Regras**: `requireOwner`; valida (`name` não vazio, `price >= 0`, `durationMinutes > 0`); cria com
  `isActive = true`. Violação do índice parcial de nome ⇒ `name_taken` (FR-012).
- **reasons**: `forbidden`, `invalid_input`, `name_taken`.

### `updateService(input)`

- **Input**: `{ serviceId: string, name?, price?, durationMinutes? }`.
- **Output**: `{ ok: true } | { ok: false, reason }`.
- **Regras**: `requireOwner`; valida; atualiza. Editar duração **não** recalcula bookings existentes
  (FR-007/D5). Conflito de nome entre ativos ⇒ `name_taken`.
- **reasons**: `forbidden`, `not_found`, `invalid_input`, `name_taken`.

### `deactivateService(input)`  (a "remoção" — FR-005/FR-006)

- **Input**: `{ serviceId: string }`.
- **Output**: `{ ok: true } | { ok: false, reason }`.
- **Regras**: `requireOwner`; aplica `isActive = false` (nunca delete físico). Agendamentos existentes
  são preservados; o serviço some da listagem pública.
- **reasons**: `forbidden`, `not_found`, `already_inactive`.

### `reactivateService(input)`

- **Input**: `{ serviceId: string }`.
- **Output**: `{ ok: true } | { ok: false, reason }`.
- **Regras**: `requireOwner`; aplica `isActive = true`. Se já houver um serviço **ativo** com o mesmo
  nome ⇒ `name_taken` (índice parcial).
- **reasons**: `forbidden`, `not_found`, `name_taken`.

### `listServicesForOwner()`

- **Input**: nenhum.
- **Output**: `Service[]` — inclui **ativos e inativos** (`{ id, name, price, durationMinutes, isActive }`).
- **Regras**: `requireOwner`. (Diferente da listagem pública, que mostra só ativos.)

---

## Horário de funcionamento (US2)

### `setOpeningHours(input)`

- **Input**: `{ weekday: number /* 0–6 */, opensAtMinutes: number, closesAtMinutes: number }`.
- **Output**: `{ ok: true } | { ok: false, reason }`.
- **Regras**: `requireOwner`; valida `closesAtMinutes > opensAtMinutes` (FR-009); upsert por
  `(barbershopId, weekday)`. Passa a reger a disponibilidade futura (FR-010); não toca bookings (FR-011).
- **reasons**: `forbidden`, `invalid_input`.

### `closeDay(input)`

- **Input**: `{ weekday: number }`.
- **Output**: `{ ok: true } | { ok: false, reason }`.
- **Regras**: `requireOwner`; marca o dia como fechado (remove a janela do weekday). **Idempotente**:
  fechar um dia já fechado é um no-op de sucesso (`{ ok: true }`). Nenhum horário é oferecido nesse
  dia (FR-008); bookings existentes preservados (FR-011).
- **reasons**: `forbidden`, `invalid_input` (weekday fora de 0–6).

---

## Ajuste na 001 (público — único toque permitido)

### `listServices()` (existente, 001)

- **Mudança**: passa a filtrar `where: { isActive: true }` (FR-006). Forma de saída inalterada
  (`{ id, name, price, durationMinutes }`). Nenhuma outra mudança de comportamento (Princípio VI).

---

## Mapa Requisito → Contrato

| Requisito | Action |
|-----------|--------|
| FR-001 / FR-001a | `requireOwner` (guard em todas) + `role` default no banco |
| FR-002 / FR-003 / FR-004 | `createService`, `updateService` |
| FR-005 / FR-006 | `deactivateService` (+ `reactivateService`); ajuste em `listServices` |
| FR-007 | `updateService` (sem recálculo de bookings) |
| FR-008 / FR-009 / FR-010 / FR-011 | `setOpeningHours`, `closeDay` |
| FR-012 / FR-013 | índice parcial → `name_taken` em create/update/reactivate |
| FR-014 | envelopes `{ ok:false, reason }` sem detalhe sensível |
