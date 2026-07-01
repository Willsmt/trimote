# Contrato: Remarcação (004-reschedule-booking)

Contratos das interfaces server desta feature. Reusa os tipos/erros da 001 onde aplicável.

## Server Action: `rescheduleBooking`

`src/server/actions/reschedule-booking.ts` — Server Action fina; deriva o owner da sessão e delega ao
core. Não contém regra de negócio (padrão `cancelBooking`).

```ts
"use server";

async function rescheduleBooking(input: {
  bookingId: string;
  serviceId: string;   // serviço escolhido (pode ser o mesmo)
  startsAt: string;    // ISO 8601 (UTC) do novo início (pode ser o mesmo)
}): Promise<RescheduleBookingResult>;
```

- Deriva `userId` via `requireUser()` (lança `UnauthorizedError` se não autenticado).
- Converte `startsAt` (ISO) para `Date` e chama `rescheduleBookingForUser`.

## Core: `rescheduleBookingForUser`

`src/server/booking/reschedule-booking.ts` — testável isoladamente com `userId` e `now` explícitos.

```ts
interface RescheduleBookingInput {
  userId: string;
  bookingId: string;
  serviceId: string;
  startsAt: Date;
  now?: Date;          // injetável para teste; default new Date()
}

type RescheduleBookingReason =
  | "not_found"
  | "not_owner"
  | "not_active"
  | "booking_in_past"
  | "service_not_found"
  | "service_inactive"
  | "in_the_past"
  | "outside_opening_hours"
  | "no_change"
  | "slot_unavailable";

type RescheduleBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: RescheduleBookingReason };

async function rescheduleBookingForUser(
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult>;
```

**Ordem de verificação (curto-circuito; nenhuma recusa altera o booking — FR-009):**

Posse e elegibilidade **primeiro** (enforcement de segurança, antes de qualquer trabalho — Princípio I).

1. Carrega booking (`id`, `userId`, `status`, `startsAt`, `serviceId`). Ausente → `not_found`.
2. **Posse**: `booking.userId !== userId` → `not_owner`.
3. **Elegibilidade (ativo)**: `booking.status !== "ACTIVE"` → `not_active`.
4. **Elegibilidade (futuro)**: `booking.startsAt <= now` → `booking_in_past` (fronteira pelo início).
5. `no_change`: `serviceId === booking.serviceId && startsAt === booking.startsAt` → `no_change`
   (recusa amigável, sem carregar serviço nem escrever).
6. Carrega serviço escolhido (com expediente). Ausente → `service_not_found`.
6b. **Troca de serviço inativo**: se `serviceId !== booking.serviceId` **e** o serviço escolhido está
   inativo (`isActive === false`) → `service_inactive`. Se **mantém** o serviço atual
   (`serviceId === booking.serviceId`), NÃO checa `isActive` (preserva o agendamento existente).
7. `startsAt <= now` → `in_the_past`.
8. Serviço não cabe na janela do dia (fuso da barbearia) → `outside_opening_hours`.
9. `endsAt = startsAt + service.durationMinutes`; `prisma.$transaction(update da mesma linha)`.
   - Violação de exclusion constraint (`23P01`/`booking_no_overlap`) → `slot_unavailable`.
   - Sucesso → `{ ok: true, bookingId }`.

> A detecção de violação reusa a mesma lógica de `createBooking` (`isExclusionViolation`). Recusas de
> negócio não são logadas como erro.

## Ajuste 001 (ÚNICO): `getAvailableSlots`

`src/server/actions/get-available-slots.ts` — parâmetro **opcional** adicional, retrocompatível:

```ts
async function getAvailableSlots(input: {
  serviceId: string;
  date: string;             // YYYY-MM-DD no fuso da barbearia
  excludeBookingId?: string; // NOVO: exclui esse booking do cálculo de colisão (remarcação)
}): Promise<GetAvailableSlotsResult>;
```

- Quando `excludeBookingId` está presente, a busca de `activeBookings` adiciona
  `id: { not: excludeBookingId }` ao `where`. Sem o parâmetro, comportamento **idêntico** ao atual.
- `computeAvailableSlots` (domínio puro) **não** muda.

## UI (contrato de exibição)

- A ação **"Remarcar"** aparece em "Meus agendamentos" **apenas** para agendamentos `ACTIVE` e futuros
  (conveniência; o servidor revalida — FR-010).
- O flow de remarcação reusa a seleção de serviço/dia/horário do agendamento, chamando
  `getAvailableSlots` com `excludeBookingId = bookingId`.
- Mensagens de recusa (mapa de `reason` → texto amigável), incl. `no_change` ("Esse já é o horário e
  serviço atuais do agendamento."), `service_inactive` ("Esse serviço não está mais disponível.
  Escolha outro.") e `slot_unavailable` ("Horário indisponível. Escolha outro.").
