# Phase 1 — Contracts: Server Actions / Route Handlers

Interface de servidor exposta pela feature. Todas as operações de escrita/leitura de agendamento são
**Server Actions** (Next.js App Router) que validam a sessão no servidor (Princípio I). Entradas são
validadas estritamente no servidor; a validação de cliente é apenas conveniência de UX.

Convenções:

- **Auth**: salvo `listServices`, toda action exige sessão válida; sem sessão ⇒ recusa não-autorizado
  (FR-001).
- **Owner**: o `userId` é sempre derivado da sessão, nunca recebido do cliente (FR-010..FR-012).
- **Tempo**: `date` e horários de entrada/saída referem-se a `America/Sao_Paulo`; instantes trafegam
  como ISO 8601 e são convertidos na camada de tempo (FR-014).
- **Erros**: retornos de negócio usam um envelope `{ ok: false, reason }`; nunca vazam detalhe interno
  (Princípio I).

---

## `listServices()`

Lista os serviços oferecidos (US3 / FR-002). Não exige autenticação.

- **Input**: nenhum.
- **Output**: `Service[]` — cada item `{ id, name, price, durationMinutes }`.
- **Erros**: nenhum esperado (catálogo público).

---

## `getAvailableSlots(input)`

Calcula os horários livres de um dia para um serviço (US1 / FR-003..FR-006). Pode exigir sessão (UI já
autenticada); a regra de negócio não depende do owner.

- **Input**: `{ serviceId: string, date: string /* YYYY-MM-DD em America/Sao_Paulo */ }`.
- **Output**: `{ slots: string[] /* horários de início ISO 8601 (UTC) */ }`.
- **Regras**:
  - Deriva slots do `OpeningHours` do `weekday` da `date`, passo `slotStepMinutes` (default 30).
  - Inclui `t` somente se `[t, t + service.durationMinutes)` couber em `[opensAt, closesAt)` (FR-004,
    FR-005), não colidir com booking ativo, e `t > now` em `America/Sao_Paulo` (FR-006).
  - Dia sem `OpeningHours` ⇒ `slots: []`.
- **Erros**: `service_not_found`.

---

## `createBooking(input)`

Cria um agendamento (US1 / FR-007..FR-009, FR-015). Exige sessão.

- **Input**: `{ serviceId: string, startsAt: string /* ISO 8601 */ }`.
- **Output**: `{ ok: true, bookingId } | { ok: false, reason }`.
- **Regras / fluxo**:
  1. Valida sessão; `userId` ← sessão.
  2. Valida `serviceId`; calcula `endsAt = startsAt + durationMinutes`.
  3. Revalida no servidor: `startsAt > now` (FR-006) e cabe no expediente (FR-004/FR-005).
  4. `prisma.$transaction`: INSERT do `Booking` com `status = ACTIVE`.
  5. Se a **exclusion constraint** `booking_no_overlap` for violada (SQLSTATE `23P01`), capturar e
     retornar `{ ok: false, reason: 'slot_unavailable' }` (FR-015) — sem criar o agendamento.
- **Erros (reason)**: `unauthorized`, `service_not_found`, `in_the_past`, `outside_opening_hours`,
  `slot_unavailable`.
- **Garantia de concorrência**: sob duas chamadas simultâneas para o mesmo intervalo, no máximo uma
  retorna `ok: true`; a outra retorna `slot_unavailable` (FR-009). Garantido pelo banco, não pela app.

---

## `listMyBookings()`

Lista os agendamentos do próprio cliente (US2 / FR-010). Exige sessão.

- **Input**: nenhum.
- **Output**: `Booking[]` do `userId` da sessão — `{ id, serviceName, startsAt, endsAt, status }`.
- **Regras**: filtra por `userId` da sessão; nunca expõe bookings de terceiros (FR-012).
- **Erros**: `unauthorized`.

---

## `cancelBooking(input)`

Cancela um agendamento do próprio cliente (US2 / FR-011, FR-013). Exige sessão.

- **Input**: `{ bookingId: string }`.
- **Output**: `{ ok: true } | { ok: false, reason }`.
- **Regras**:
  - Carrega o booking e verifica `booking.userId === session.user.id` (FR-011/FR-012); caso contrário
    `not_owner` (sem revelar existência — Princípio I).
  - Só `status = ACTIVE` pode ser cancelado; aplica `status = CANCELLED`, `cancelledAt = now`.
  - O intervalo é liberado automaticamente (exclusion constraint parcial em `ACTIVE`) — FR-013.
- **Erros (reason)**: `unauthorized`, `not_owner`, `not_found`, `already_cancelled`.

---

## Mapa Requisito → Contrato

| Requisito | Action |
|-----------|--------|
| FR-001 | guarda de sessão em todas (exceto `listServices`) |
| FR-002 | `listServices` |
| FR-003..FR-006 | `getAvailableSlots` |
| FR-007..FR-009, FR-015 | `createBooking` |
| FR-010, FR-012 | `listMyBookings` |
| FR-011, FR-013 | `cancelBooking` |
| FR-014 | camada de tempo usada por `getAvailableSlots` e `createBooking` |
