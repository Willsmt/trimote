# Quickstart / Validação: Remarcar Agendamento (004-reschedule-booking)

Cenários que provam a feature ponta a ponta. A garantia crítica (não-sobreposição, exclude-self) é
coberta por testes de integração contra o Postgres (test-first, Princípio IV); o fluxo de UI é validado
manualmente. Referências: [contracts/reschedule-booking.md](./contracts/reschedule-booking.md),
[data-model.md](./data-model.md).

## Pré-requisitos

- Postgres em Docker no `:5433` no ar; `.env` configurado (ver README).
- `npm install && npm run db:migrate && npm run db:seed`.
- Um cliente autenticado com ao menos um agendamento `ACTIVE` futuro.
- App: `npm run dev`.

## Testes automatizados (integração — test-first)

`tests/integration/reschedule/` (rodar com `npm run test:integration`, Postgres no ar):

1. **exclude-self**: `getAvailableSlots({ serviceId, date, excludeBookingId })` para o dia do próprio
   booking **inclui** o horário atual do booking (não auto-bloqueia) e suas adjacências válidas.
2. **mover + liberar**: `rescheduleBookingForUser` move o booking (mesma `id`) para um horário livre;
   depois, `getAvailableSlots` (sem exclude) volta a ofertar o horário **antigo** como livre (FR-003).
3. **conflito/concorrência**: alvo ocupado por outro booking `ACTIVE` → `slot_unavailable`; o booking
   original permanece intacto (SC-007).
4. **no_change**: mesmo `serviceId` e mesmo `startsAt` → `no_change`, sem UPDATE (FR-012).
5. **ownership/elegibilidade**: `not_owner` (booking de outro), `not_active` (cancelado),
   `booking_in_past` (booking passado), `in_the_past` (alvo no passado).
6. **troca de serviço**: remarcar trocando para um serviço de duração maior; só horários onde ele cabe
   inteiro são aceitos; um alvo onde não cabe → `outside_opening_hours` (FR-004).

## Smoke manual (UI)

### C1 — Mover para outro horário (US1 / SC-001, SC-003)
1. Em "Meus agendamentos", num agendamento ativo futuro, clicar **Remarcar**.
2. Escolher um horário livre (mesmo serviço), confirmar.
3. **Esperado**: o agendamento aparece no novo horário (mesma identidade); o horário antigo volta a
   aparecer como livre ao iniciar um novo agendamento.

### C2 — Trocar o serviço ao remarcar (US2 / SC-002)
1. No flow de remarcação, trocar para um serviço de duração diferente.
2. **Esperado**: só aparecem horários em que o novo serviço cabe inteiro; ao confirmar, o agendamento
   reflete o novo serviço e horário.

### C3 — Recusa "mesmo horário e serviço" (FR-012)
1. Abrir a remarcação e confirmar sem mudar serviço nem horário.
2. **Esperado**: recusa amigável — "Esse já é o horário e serviço atuais do agendamento." — sem alterar
   nada.

### C4 — Proteções (US3 / SC-004, SC-005, SC-006)
1. Tentar remarcar (via manipulação direta) um agendamento de outro cliente → recusado (`not_owner`).
2. Um agendamento cancelado/passado não oferece "Remarcar"; mesmo forçando, o servidor recusa.
3. Alvo no passado → recusado (`in_the_past`).

## Regressão (não enfraquecer 001/002)
- `npm test` continua verde (agendar/cancelar/disponibilidade/owner intactos).
- O único arquivo da 001 alterado é `get-available-slots.ts` (param opcional); o fluxo de agendar, que
  não passa o parâmetro, comporta-se de forma idêntica.
