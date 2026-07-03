# Contract: Negócio ativo + guard de dono (US2/US3)

O negócio ativo é **estado de sessão no servidor** (`Session.activeBusinessId`), revalidado por
request. `requireOwner` passa a significar "membro OWNER do negócio ativo". `businessId` **nunca** vem
do input (anti-IDOR — FR-014).

## Core — `src/server/business/active-business.ts`

```ts
export type ActiveBusiness =
  | { state: "active"; businessId: string; timeZone: string; name: string }
  | { state: "needs_selection"; options: { businessId: string; name: string }[] } // N>1 sem escolha válida
  | { state: "empty" };                                                            // 0 vínculos

export async function getActiveBusiness(userId: string): Promise<ActiveBusiness>;
```

Comportamento:
1. Lê os `BusinessMember` (role OWNER) do `userId`.
2. **0 vínculos** → `empty`.
3. **1 vínculo** → `active` (auto-seleciona; ignora `activeBusinessId` divergente).
4. **N>1**: lê `Session.activeBusinessId`; se aponta para um negócio **do qual o user é membro OWNER**
   → `active`; senão → `needs_selection` (lista os negócios do vínculo).
5. **Revalida membership a cada request** (o `activeBusinessId` é só um ponteiro; a autoridade é o
   vínculo). Nunca confia no client.

## Core — `src/server/business/switch-business.ts`

```ts
export type SwitchBusinessReason = "not_member";
export type SwitchBusinessResult = { ok: true } | { ok: false; reason: SwitchBusinessReason };

export async function switchActiveBusiness(input: {
  userId: string; sessionToken: string; businessId: string;
}): Promise<SwitchBusinessResult>;
```
- Valida que `userId` é membro OWNER de `businessId`; se sim, `prisma.session.update({ where:
  { sessionToken }, data: { activeBusinessId: businessId } })`. Se não, `not_member` (não grava).

## Guard — `src/server/auth/owner.ts` (redefinido)

```ts
export async function requireOwner(): Promise<{ user: { id: string }; businessId: string; timeZone: string }>;
// getCurrentUser() -> UnauthorizedError; getActiveBusiness(user.id):
//   "active"          -> retorna { user, businessId, timeZone }
//   "needs_selection" -> NeedsBusinessSelectionError (UI mostra o seletor)
//   "empty"           -> NoBusinessError (UI mostra estado vazio orientando contato com ADMIN)
```
- Substitui `assertOwnerRole` (que lia `User.role === OWNER`). Todas as actions/pages de dono passam a
  usar o `businessId` retornado — **nunca** um id de input.

## Server Action — `src/server/actions/switch-business.ts`

```ts
export async function switchBusiness(input: { businessId: string }): Promise<SwitchBusinessResult>;
// requireUser(); lê sessionToken do cookie; delega a switchActiveBusiness; revalida membership.
```

## UI — `src/components/owner/business-switcher.tsx`

- Ilha client no header/áreas de dono: lista os negócios do vínculo; troca chama `switchBusiness` +
  `router.refresh()`. **Oculto** quando há 1 negócio; **estado vazio** (orientar contato com ADMIN)
  quando há 0.

## Invariantes (testáveis)

- Dono de A com `activeBusinessId=B` (forjado) mas sem vínculo em B → `getActiveBusiness` **não**
  devolve B (revalidação) — SC-001/SC-002.
- `switchActiveBusiness` para negócio sem vínculo → `not_member`, não grava (SC-001).
- 1 negócio → `active` sem seleção; 0 → `empty` sem erro (SC-010, edge).
- Toda operação de dono deriva `businessId` de `requireOwner()` (0% do input) — SC-002.
