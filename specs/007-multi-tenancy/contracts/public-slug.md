# Contract: Página pública por slug + cliente global (US4/US5)

Cada negócio tem `/b/[slug]`; o cliente vê os serviços **daquele** negócio e agenda nele. As
listagens do cliente agregam todos os negócios, **rotulando** cada item.

## Página pública — `src/app/b/[slug]/page.tsx`

- Resolve `business` por `slug` (`prisma.business.findUnique({ where: { slug } })`); **`notFound()`**
  (404 tratado) se não existir (FR-019).
- Lista os **serviços ativos daquele negócio** e entra no fluxo de agendamento **no contexto do
  negócio** (o `businessId`/serviços vêm do slug da rota — origem pública legítima, não input de
  operação de dono).
- Negócio sem serviços → lista vazia tratada (edge).

## Leitura pública de serviços por negócio

```ts
// src/server/actions/list-services.ts (ajustada) OU leitura direta na page:
export async function listServicesForBusiness(businessId: string): Promise<ServiceListItem[]>;
// where { businessId, isActive: true }; escopada pelo negócio do slug.
```
- A `listServices()` atual (sem escopo) é **substituída** por leitura escopada ao negócio do slug. A
  antiga `/booking` e `/services` passam a exigir contexto de negócio (via `/b/[slug]`); decidir nas
  tasks se `/booking` sem slug redireciona/lista negócios (fora de escopo marketplace) ou é
  descontinuada em favor de `/b/[slug]`.

## Booking no contexto do negócio (US4)

- Agendar a partir de `/b/[slug]` cria o `Booking` com o `businessId` do negócio do slug (o serviço
  escolhido pertence a ele). Fluxo F001/F004 (criar/remarcar/cancelar/slots) **por negócio**;
  não-sobreposição por negócio (constraint). Remarcar mantém o **mesmo** negócio (edge).

## Cliente global + rótulo de negócio (US5)

- `/my-bookings` e `/my-spending` **não** filtram por negócio (cliente é global); cada item ganha
  `business: { name }` no `select`/DTO. `client-history` (F006) inclui o nome do negócio por linha.
- Conta única: o mesmo cliente agenda em qualquer negócio sem cadastro adicional (SC-009).

## Invariantes (testáveis)

- Slug inexistente → `notFound()` (SC-007). Slug único (SC-007).
- Agendar em `/b/[slug]` → booking vinculado ao negócio do slug (FR-020).
- `/my-bookings`/`/my-spending` de um cliente com itens em 2 negócios → mostram os dois, cada um
  rotulado (SC-009).
- Não-sobreposição por negócio preservada: A e B no mesmo horário coexistem (SC-008).
