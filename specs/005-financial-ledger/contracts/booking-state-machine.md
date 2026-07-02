# Contrato — Integração com a Máquina de Estados (F004): `already_completed`

Ponto **exato** de inserção do branch de recusa para booking `COMPLETED`, respeitando o padrão de cada
core (item 17 do input; research.md D3). Reason **distinto** `already_completed` — nunca reutilizar
`not_active`/`already_cancelled`. Nenhuma outra proteção é reescrita (Princípio VI).

## 1. `src/server/booking/reschedule-booking.ts` — ALLOWLIST

Hoje (F004): `not_found → not_owner → not_active(!== ACTIVE) → booking_in_past → no_change → …`

**Inserir** entre `not_owner` (passo 2) e o check `!== "ACTIVE"` (passo 3):

```ts
// ANTES do "if (booking.status !== 'ACTIVE')": um COMPLETED cairia no genérico not_active.
if (booking.status === "COMPLETED") {
  return { ok: false, reason: "already_completed" };
}
```

- Adicionar `"already_completed"` ao union `RescheduleBookingReason`.
- Atualizar o comentário de "Ordem de verificação" no topo do arquivo (novo passo 3).

## 2. `src/server/booking/cancel-booking.ts` — DENYLIST

Hoje (F004): `not_found → not_owner → already_cancelled(=== CANCELLED) → UPDATE`

**Cuidado**: como é denylist, sem ajuste um `COMPLETED` **passaria** e seria cancelado (bug).
**Inserir** junto ao check `already_cancelled`, **antes** do `update`:

```ts
if (booking.status === "CANCELLED") {
  return { ok: false, reason: "already_cancelled" };
}
if (booking.status === "COMPLETED") {
  return { ok: false, reason: "already_completed" };
}
```

- Adicionar `"already_completed"` ao union `CancelBookingReason`.

## 3. Mapas de mensagem (UI) — evitar renderização ausente

Ambos os fluxos client que exibem reasons ganham a chave `already_completed` (mensagem em português),
mesma classe do bug conhecido em que `no_change` não renderizava:

- `src/components/reschedule-flow.tsx` → `FAILURE_MESSAGES.already_completed = "Este atendimento já foi
  concluído e não pode ser alterado."`
- `src/components/my-bookings-list.tsx` → adicionar a mesma chave ao mapa de mensagens de cancelamento.

## 4. Conclusão (US1) — mesmo reason

O core `completeBookingForOwner` recusa a **segunda** conclusão de um `COMPLETED` com o mesmo reason
`already_completed` (ver `complete-booking.md`, passo 2). Consistência dos três caminhos que tocam um
booking concluído: **concluir**, **remarcar**, **cancelar** → todos `already_completed`.

## Cobertura de teste (test-first)

- Remarcar um booking `COMPLETED` → `{ ok:false, reason:"already_completed" }`, booking intacto (SC-004).
- Cancelar um booking `COMPLETED` → `{ ok:false, reason:"already_completed" }`, **não** vira CANCELLED
  (regressão do bug denylist).
- Concluir um booking `COMPLETED` → `already_completed`, sem 2º lançamento (SC-003).
