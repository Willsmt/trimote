# Data Model: Multi-tenancy (F007)

Duas ondas: **rename** (estrutural, zero lógica) e **funcional** (novas entidades/colunas + backfill).
Nomes em inglês (código/banco); `cuid`, `Decimal(10,2)`, `Timestamptz(6)` como nas features
anteriores.

## Onda 1 — Rename (migration 1, `ALTER TABLE RENAME`)

| Antes | Depois | Observação |
|---|---|---|
| `Barbershop` | `Business` | + coluna `segment text NOT NULL DEFAULT 'barbershop'` |
| `BarbershopService` | `Service` | pertence a `Business` |
| `OpeningHours.barbershopId` | `.businessId` | `@@unique([businessId, weekday])` renomeado |
| `Booking.barbershopId` | `.businessId` | `@@index([businessId, status])`; **exclusion constraint** preservada |
| `LedgerEntry.barbershopId` | `.businessId` | `@@index([businessId, occurredAt])` renomeado |
| relations `barbershop` | `business` | nomes de relação Prisma atualizados |

**Exclusion constraint (preservada, não recriada)**:
`booking_no_overlap EXCLUDE USING gist ("businessId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (status='ACTIVE')`
— após o `RENAME COLUMN`, a definição passa a referenciar `businessId` automaticamente (Postgres
atualiza a constraint). O gate pós-M1 verifica isso em `pg_constraint`.

**Nada muda de comportamento na onda 1** — só nomes. Os 139 testes (renomeados) permanecem verdes.

## Onda 2 — Funcional (migration 2 + backfill)

### Business (campos novos)

| Campo | Tipo | Regra |
|---|---|---|
| `slug` | `String @unique` | URL-safe `^[a-z0-9]+(-[a-z0-9]+)*$`, único, fora dos reservados; imutável pela UI (FR-023) |
| `segment` | `String @default("barbershop")` | criado na onda 1; sem ramificação de comportamento (FR-003) |
| `timezone` | `String` (renomeado de Barbershop) | fuso do **negócio** (Princípio VII) |
| (auditoria de criação) | `createdBy String?` FK→User, `createdAt` | quem/quando criou (FR-007); nullable p/ o business de backfill |

### BusinessMember (NOVO — vínculo N:N dono↔negócio)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` FK→User (relation `Membership`) | o membro |
| `businessId` | `String` FK→Business | o negócio |
| `role` | `BusinessRole` | **OWNER** hoje (enum nasce só com OWNER; STAFF futuro aditivo) |
| `createdAt` | `DateTime @db.Timestamptz(6)` | auditoria |
| `createdBy` | `String` FK→User (relation `MembershipCreatedBy`) | quem promoveu (auditoria, FR-009) |
| — | `@@unique([userId, businessId])` | **vínculo duplicado impossível no dado** (Princípio II) |

Relations **nomeadas** (duas FKs p/ User): `Membership` (o membro) vs. `MembershipCreatedBy` (o autor)
— mesmo padrão de `LedgerClient`/`LedgerCreatedBy` da F005.

### User / Role

| Item | Mudança |
|---|---|
| `enum Role` | `+ ADMIN` (aditivo, como `COMPLETED` na F005). `OWNER` **permanece** no enum mas deixa de ser autoridade (D4) |
| `User.role` | passa a valer `CLIENT` ou `ADMIN` na prática (backfill rebaixa OWNER→CLIENT) |
| `User` relations | `+ memberships (BusinessMember[])`, `+ membershipsCreated (BusinessMember[])` |

### Session (NOVO campo — negócio ativo)

| Campo | Tipo | Regra |
|---|---|---|
| `activeBusinessId` | `String?` FK→Business, `onDelete: SetNull` | negócio ativo **server-side** (D5); revalidado por request; nunca do input |

### BusinessRole (NOVO enum)

```
enum BusinessRole { OWNER }   // STAFF é aditivo no futuro; não existe agora
```

## Backfill (na migration 2, mesmo deploy — FR-024)

1. O **Business existente** (a barbearia de seed/dev) ganha um `slug` derivado do nome (validado) e
   `segment='barbershop'` (já default).
2. Para cada `User` com `role='OWNER'`: criar `BusinessMember(userId, <business existente>, OWNER,
   createdBy=<self ou operador>, createdAt=now)` e **rebaixar** `User.role` para `CLIENT`.
3. Promover `willmarthins@gmail.com` a `Role.ADMIN` (bootstrap documentado, D11 — idempotente).
4. **Invariante**: contagem e `businessId` de `Booking`/`LedgerEntry`/`Service`/`OpeningHours`
   permanecem **idênticos** (o rename já preservou os vínculos; o backfill não os toca).

## Entidades reusadas (sem mudança de lógica, só escopo/rename)

- **Service, OpeningHours, Booking, LedgerEntry, LedgerEntryItem**: renomeadas p/ `businessId`;
  comportamento (não-sobreposição, snapshot, soft delete, agregação por range em UTC) **inalterado**,
  agora por negócio.

## DTOs de leitura afetados (US5 — rótulo de negócio)

- **`/my-bookings`** e **`/my-spending`**: cada item ganha o **nome do negócio** no `select`/DTO
  (`business.name`). `client-history` (F006) e a listagem de bookings do cliente incluem
  `business: { name }`. Nenhuma mudança de filtro (o cliente já é global; só rotula).

## Invariantes (verificáveis)

- `@@unique([userId, businessId])` (vínculo único) e `Business.slug @unique` (slug único) — no banco.
- `booking_no_overlap` por `businessId` preservada (gate `pg_constraint`).
- `businessId` de toda operação de dono deriva da sessão (nunca input) — anti-IDOR (FR-014/SC-001/002).
- Backfill preserva 100% dos dados (FR-024/SC-005); 139 testes verdes pós-M1 e pós-M2 (SC-006).
- Sem caminho público p/ escrever `User.role` ou `BusinessMember` (FR-006/SC-004).
