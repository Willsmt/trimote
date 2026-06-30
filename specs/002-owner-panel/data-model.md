# Phase 1 — Data Model: Painel do Dono

Mudanças de modelo para a 002. Reusa o schema da 001; descreve apenas as adições/ajustes. Nomes em
inglês (Princípio V); integridade no banco (Princípio II).

## Mudanças no schema

### User — adiciona `role`

| Campo | Tipo | Regras |
|-------|------|--------|
| `role` | enum `Role` | `@default(CLIENT)`. Distingue dono de cliente. |

```text
enum Role { CLIENT, OWNER }
```

- Migration via `prisma migrate` (Prisma modela enums e default normalmente).
- Promoção a `OWNER` via seed/script (FR-001a) — não há UI de gestão de usuários.

### BarbershopService — adiciona `isActive`

| Campo | Tipo | Regras |
|-------|------|--------|
| `isActive` | `Boolean` | `@default(true)`. Soft delete: desativar em vez de apagar (FR-005/FR-006). |

- Invariantes adicionais (validação de input — FR-003): `name` não vazio, `price >= 0`,
  `durationMinutes > 0` (reforço opcional por `CHECK`).

#### Unicidade de nome entre ativos (índice único parcial — FR-012/FR-013)

Garantida no banco por **migration SQL manual** (o Prisma não expressa índice único parcial no
`schema.prisma`):

```sql
CREATE UNIQUE INDEX barbershopservice_active_name_key
  ON "BarbershopService" ("name")
  WHERE "isActive" = true;
```

- Permite reusar o nome de um serviço **desativado**. A violação (`23505`) é traduzida em `name_taken`.

## Entidades inalteradas (contexto)

- **OpeningHours** (001): `(barbershopId, weekday, opensAtMinutes, closesAtMinutes)`, `@@unique(barbershopId, weekday)`.
  A 002 permite ao dono editá-la; sem mudança de forma. "Fechado" = ausência de linha do weekday (ou
  remoção da linha existente).
- **Booking** (001): **não** é alterado. Protegido por design:
  - `endsAt` materializado na reserva → editar duração do serviço não afeta bookings existentes (D5).
  - FK para `BarbershopService` preservada pelo soft delete (nunca delete físico) (D3).
  - Disponibilidade derivada de `OpeningHours` em tempo de consulta → mudar expediente não toca
    bookings (D6).

## Transições de estado — Serviço

```text
(criação) ──> ACTIVE (isActive=true)
ACTIVE ──desativar──> INACTIVE (isActive=false)   # "remoção" de serviço em uso
INACTIVE ──reativar──> ACTIVE (isActive=true)     # respeita unicidade de nome entre ativos
```

- Desativar é o caminho para "remover" quando há agendamentos ativos futuros (FR-005); nunca há delete
  físico no MVP.

## Mapa Requisito → Garantia

| Requisito | Onde é garantido |
|-----------|------------------|
| FR-001 (só OWNER) | `User.role` + guard `requireOwner` no servidor |
| FR-001a (default CLIENT) | `@default(CLIENT)` no banco |
| FR-005/FR-006 (soft delete) | `isActive` + filtro na listagem pública |
| FR-007 (edição de duração) | `endsAt` materializado (001) — sem recálculo |
| FR-011 (expediente) | disponibilidade derivada (001) — sem escrita em Booking |
| FR-012/FR-013 (unicidade ativa) | índice único parcial (`WHERE isActive=true`) |

## Ajuste em código da 001 (único permitido — Princípio VI)

- `listServices` (`src/server/actions/list-services.ts`): adicionar `where: { isActive: true }`.
  Nenhuma outra mudança de comportamento.
