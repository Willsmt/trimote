# Data Model: Navegação e Sessão (003-nav-session)

**Sem mudanças de schema. Nenhuma migration.** A feature deriva a navegação de dados já existentes.

## Entidades reusadas (somente leitura)

### Session (NextAuth, estratégia `database`)

- Origem: `getServerSession(authOptions)` via `src/server/auth/session.ts`.
- Campos relevantes: `user.id`, `user.name`, `user.email` (para identificar a sessão — FR-007).
- Presença/ausência determina visitante vs. autenticado. Expiração → ausência → navegação de
  visitante (FR-012, edge case de sessão expirada).

### User.role (enum `Role` da 002)

- Valores: `CLIENT | OWNER`.
- **Fonte de verdade**: lido do **banco** por requisição (`prisma.user.findUnique({ select: { role } })`),
  a mesma leitura usada por `assertOwnerRole`/`requireOwner`. Garante papel atual, não cacheado (FR-009).

## Estado derivado (não persistido): NavState

Calculado no servidor por `getNavSession()` + `SiteHeader` a cada renderização. Não é armazenado.

| Condição (entrada)                              | NavState (saída) |
|-------------------------------------------------|------------------|
| Sem sessão                                      | `VISITOR`        |
| Sessão presente, `role = CLIENT`                | `CLIENT`         |
| Sessão presente, `role = OWNER`                 | `OWNER`          |
| Sessão presente, papel não reconhecido/ausente  | `CLIENT` (menor privilégio — nunca expõe Painel) |

A relação NavState → links exibidos está em [`contracts/nav-contract.md`](./contracts/nav-contract.md).

## Helper novo

- `getNavSession(): Promise<{ user, role } | { user: null, role: null }>` em `src/server/auth/session.ts`.
  - Sem sessão → `{ user: null, role: null }`.
  - Com sessão → lê `role` do banco e devolve `{ user, role }`.
  - Não decide autorização (isso é do `requireOwner`); apenas fornece dados para a exibição.
