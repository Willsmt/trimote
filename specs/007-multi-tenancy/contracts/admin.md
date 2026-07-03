# Contract: Administração da plataforma (US1)

Área ADMIN: criar negócio e promover dono. Exige `requireAdmin` (papel de plataforma, lido do banco).
Não há action "promover a ADMIN" (D6, camada 3).

## Guard — `src/server/auth/admin.ts`

```ts
export async function requireAdmin(): Promise<{ id: string }>;
// getCurrentUser() -> UnauthorizedError se visitante; User.role lido do BANCO ->
// ForbiddenError se != ADMIN. Nunca de cookie/JWT/input.
```

## Core — `src/server/business/admin-create-business.ts`

```ts
export interface CreateBusinessInput {
  adminId: string;           // = requireAdmin().id (autor/auditoria)
  name: string;
  slug: string;              // pré-preenchido do nome na UI; validado aqui
  timeZone: string;
  segment?: string;          // default "barbershop"
}
export type CreateBusinessReason = "invalid_slug" | "slug_taken" | "slug_reserved";
export type CreateBusinessResult =
  | { ok: true; businessId: string }
  | { ok: false; reason: CreateBusinessReason };

export async function createBusinessForAdmin(input: CreateBusinessInput): Promise<CreateBusinessResult>;
```

- Valida slug: `^[a-z0-9]+(-[a-z0-9]+)*$` (`invalid_slug`); fora de reservados
  `{admin, api, b, booking, owner, login, my-bookings, my-spending}` (`slug_reserved`); único
  (`slug_taken`, também garantido por `@unique`). Cria `Business` com `createdBy=adminId`, `createdAt`.

## Core — `src/server/business/admin-promote-owner.ts`

```ts
export interface PromoteOwnerInput {
  adminId: string;           // autor (auditoria)
  businessId: string;
  email: string;             // busca EXATA por usuário existente
}
export type PromoteOwnerReason = "business_not_found" | "user_not_found" | "already_member";
export type PromoteOwnerResult =
  | { ok: true; membershipId: string }
  | { ok: false; reason: PromoteOwnerReason };

export async function promoteOwnerForAdmin(input: PromoteOwnerInput): Promise<PromoteOwnerResult>;
```

- `email` sem usuário → `user_not_found` (sem criação implícita, FR-008). Vínculo já existente →
  `already_member` (o `@@unique` também barra no dado). Cria `BusinessMember(userId, businessId,
  OWNER, createdBy=adminId, createdAt)`. **Só promove a OWNER** — sem parâmetro de role.

## Server Actions — `src/server/actions/admin-*.ts`

```ts
export async function createBusiness(input: { name; slug; timeZone; segment? }): Promise<CreateBusinessResult>;
export async function promoteOwner(input: { businessId; email }): Promise<PromoteOwnerResult>;
```
- Ambas: `const admin = await requireAdmin()`; validam entrada (whitelist); delegam ao core com
  `adminId = admin.id`. **Nenhuma** action escreve `User.role` (D6 camada 1/3).

## UI — `/admin` (Server Component + ilhas)

- `src/app/admin/page.tsx`: `requireAdmin` (redirect padrão: visitante→login, não-ADMIN→home).
  Lista negócios; form de criar negócio (**slug pré-preenchido** do nome, editável); form de promover
  dono (busca por email). Mensagens pt-BR para cada reason (sem reason órfão — disciplina anti-`no_change`).

## Invariantes (testáveis)

- Não-ADMIN (CLIENT/OWNER) recusado em `/admin` e nas actions (SC-003).
- Criar/promover registram autor+momento (SC-003).
- 0 self-service: não existe símbolo/rota/action para elevar a ADMIN nem para o próprio usuário
  virar OWNER (SC-004).
- slug inválido/duplicado/reservado recusado (SC-007).
