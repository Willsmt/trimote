# Data Model: Remarcar Agendamento (004-reschedule-booking)

**Sem mudanças de schema. Nenhuma migration.** A remarcação opera sobre o modelo existente da 001/002.

## Entidades reusadas

### Booking (existente)

A remarcação é um **UPDATE da mesma linha** (mantém `id` — FR-001). Campos relevantes:

| Campo | Papel na remarcação |
|-------|---------------------|
| `id` | Identidade preservada (não muda). |
| `userId` | Dono — base da verificação de ownership (FR-007). |
| `serviceId` | **Pode mudar** (troca de serviço, FR-004). |
| `startsAt` (UTC) | **Pode mudar** (novo horário). |
| `endsAt` (UTC) | **Recalculado** = `startsAt + service.durationMinutes`. |
| `status` | Deve ser `ACTIVE` para remarcar (FR-008). Não muda na remarcação. |
| `barbershopId` | Inalterado. |

**Invariantes garantidas no banco (da 001):**
- Exclusion constraint `booking_no_overlap` — não-sobreposição entre bookings `ACTIVE` (FR-006).
- `CHECK (endsAt > startsAt)`.

### BarbershopService (existente)

Fonte da `durationMinutes` que materializa `endsAt` e determina se o serviço cabe na janela. A
remarcação pode associar um serviço diferente ao booking.

### Disponibilidade (derivada, existente)

`computeAvailableSlots` (domínio puro, **inalterado**). Na remarcação, o conjunto de `activeBookings`
passado **exclui o booking sendo movido** (via `excludeBookingId` na query de `getAvailableSlots`),
para o agendamento não bloquear o próprio horário/adjacências (D1).

## Estado / transições

A remarcação **não** muda o `status` (continua `ACTIVE`). É uma transição de
**(serviceId, startsAt, endsAt)** de um valor válido para outro válido, condicionada a:

1. Booking existe, é do usuário, está `ACTIVE` e é futuro (elegibilidade).
2. Há mudança real (senão `no_change`).
3. Alvo não está no passado e o serviço cabe no expediente.
4. O novo intervalo não colide com outro booking `ACTIVE` (garantido pela constraint).

## Reasons (recusas) — sem efeito colateral (FR-009)

| Reason | Quando | FR |
|--------|--------|----|
| `not_found` | Booking inexistente. | FR-007/FR-010 |
| `not_owner` | Booking de outro cliente. | FR-007 |
| `not_active` | Booking não está `ACTIVE` (ex.: cancelado). | FR-008 |
| `booking_in_past` | Booking a remarcar já passou. | FR-008 |
| `service_not_found` | Serviço escolhido inexistente. | FR-004 |
| `service_inactive` | **Troca** para um serviço inativo (manter o serviço atual não dispara). | FR-014 |
| `in_the_past` | Novo horário-alvo no passado. | FR-005 |
| `outside_opening_hours` | Novo serviço não cabe na janela do dia. | FR-004 |
| `no_change` | Mesmo serviço **e** mesmo horário (recusa amigável). | FR-012 |
| `slot_unavailable` | Colisão com outro booking ativo (`23P01`), incl. concorrência. | FR-006/FR-009 |

Sucesso: `{ ok: true, bookingId }` — booking movido (mesma identidade), horário antigo liberado.
