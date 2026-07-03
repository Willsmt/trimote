# Contract: Escopo por negócio nos cores/actions do dono (US3)

Renomeações da onda 1 (zero lógica) e re-origem do `businessId` na onda 2 (deriva do negócio ativo,
nunca do input). Os cores já eram parametrizados por `barbershopId` (F006) → viram `businessId`.

## Onda 1 — Rename (sem mudança de comportamento)

Trocar em **todos** os cores/actions/pages/fixtures:
- `prisma.barbershop` → `prisma.business`; `prisma.barbershopService` → `prisma.service`
- campo/param `barbershopId` → `businessId`; relation `barbershop` → `business`
- `BARBERSHOP_ID` (fixtures) → `BUSINESS_ID`
- Assinaturas afetadas (renome apenas): `createService`, `updateService`, `deactivateService`,
  `reactivateService`, `listServicesForOwner`, `setOpeningHours`, `closeDay`, `listOpeningHours`,
  `getCashSummaryForOwner`, `listLedgerForOwner`, `registerExpenseForOwner`, `registerWalkInForOwner`,
  `completeBookingForOwner`, `createBookingForUser`, `rescheduleBookingForUser`, `getAvailableSlots`.

**Gate**: `tsc` limpo + 139 verdes com os novos nomes.

## Onda 2 — Re-origem do `businessId` (deriva do negócio ativo)

As **actions de dono** trocam `getOwnerBarbershopId()` / `barbershop.findFirstOrThrow()` por
`requireOwner()` → usam `businessId`/`timeZone` retornados:

| Action | Antes | Depois |
|---|---|---|
| `create-service`, `list-services-for-owner` | `getOwnerBarbershopId()` | `const { businessId } = await requireOwner()` |
| `set-opening-hours`, `list-opening-hours-for-owner`, `close-day` | `getOwnerBarbershopId()` | idem |
| `register-expense`, `register-walk-in` (actions) | core fazia `business.findFirstOrThrow` | action passa `businessId` de `requireOwner()`; core recebe por parâmetro |
| `list-ledger`, `finance/page`, `ledger/page` | `business.findFirstOrThrow({timezone})` | `requireOwner()` → `businessId` + `timeZone` |

**`getOwnerBarbershopId` é removido**; `src/server/owner/barbershop.ts` some (função substituída por
`getActiveBusiness`/`requireOwner`).

### Cores que recebem `businessId` por parâmetro (mantêm assinatura, só o nome)

`getCashSummaryForOwner`, `listLedgerForOwner`, `registerExpenseForOwner`, `registerWalkInForOwner`,
`completeBookingForOwner` — o `businessId` passa a vir da action (negócio ativo). Nenhuma lógica de
agregação/keyset/atomicidade muda.

### Booking/slots (o negócio vem do serviço)

`createBookingForUser`, `rescheduleBookingForUser`, `getAvailableSlots` derivam o negócio de
`service.businessId` (como hoje derivavam de `service.barbershopId`). **Sem mudança de lógica** além
do rename; a não-sobreposição segue por negócio (constraint particiona por `businessId`).

## Invariantes (testáveis)

- Nenhuma operação de dono aceita `businessId` da entrada (0%); todas derivam de `requireOwner()`
  (SC-002).
- Dono de A não lê/escreve dados de B — caixa/razão/serviços de A não mostram/afetam B (SC-001).
- Isolamento no dado: `booking` de A e de B no **mesmo horário** coexistem (constraint por negócio);
  agregação de A não soma `LedgerEntry` de B (SC-008/SC-001).
- Pós-rename e pós-funcional: 139 verdes (SC-006).
