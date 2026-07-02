# Data Model: Financeiro — Balancete e Histórico (F006)

**Feature de LEITURA PURA — nenhuma migração, nenhuma entidade nova, nenhum campo novo.** Este
documento descreve (a) as entidades reusadas da F005 e como são **lidas**, e (b) os **DTOs de
leitura** (view models) que atravessam a fronteira Server→Client. DTO não é tabela: existe só em
memória/serialização.

## Entidades reusadas (schema inalterado — F005)

### LedgerEntry (razão)

Campos lidos por esta feature (todos já existentes):

| Campo | Tipo | Uso na F006 |
|-------|------|-------------|
| `id` | String (cuid) | Chave e **desempate** do keyset (`ORDER BY occurredAt DESC, id DESC`). |
| `barbershopId` | String | Filtro de escopo (single-shop MVP) + índice `(barbershopId, occurredAt)`. |
| `type` | `LedgerType` (INCOME/EXPENSE) | Separa entradas/saídas (US1), sinal visual (US3), filtro (US3), histórico só INCOME (US5). |
| `origin` | `LedgerOrigin` (BOOKING/WALK_IN/EXPENSE) | Exibição e filtro (US3). |
| `amount` | `Decimal(10,2)` | Soma (US1/US2), valor da linha (US3/US5). **Sempre positivo**; sinal vem do `type`. |
| `occurredAt` | `Timestamptz` (UTC) | Bucketização por período no fuso da barbearia (US1/US2); ordenação/keyset (US3/US5). |
| `description` | String | Exibição da linha (US3/US5). |
| `category` | String? | Breakdown de despesas (US2); `null` → balde "sem categoria". Filtro (US3). |
| `paymentMethod` | `PaymentMethod`? | Breakdown de entradas (US2); `null` → balde "não informado". Exibição/filtro (US3). |
| `clientId` | String? | Histórico do cliente (US5): `clientId = sessão`. `null` (anônimo) nunca casa. |
| `isActive` | Boolean | **Filtro de tudo**: agregações/histórico só `true`; listagem `true` por padrão, `false` visível só sob "mostrar inativos" (marcado). |
| `bookingId` | String? | (Não exibido diretamente; origin já indica agendamento.) |
| `items` | `LedgerEntryItem[]` | Expansão da linha (US3). |

**Não** são lidos/necessários: `externalRef`, `clientName` (exibição via `description`),
`createdBy`, `createdAt`, `updatedAt` (fora do escopo de leitura desta feature).

### LedgerEntryItem (item de lançamento)

| Campo | Tipo | Uso |
|-------|------|-----|
| `description` | String | Exibido na expansão (US3). |
| `amount` | `Decimal(10,2)` | Exibido na expansão (US3). |
| `serviceId` | String? | (Não exibido; item manual tem `null`.) |

**Nota**: os itens **não** participam das agregações do caixa — o total já está em
`LedgerEntry.amount` (a F005 garante `amount = Σ itens`). Somar itens de novo seria redundante.

### Barbershop / User (reusadas)

- `Barbershop.timezone` (String, default `America/Sao_Paulo`) — **fonte do fuso** das agregações e da
  exibição (D15). Lida por requisição, passada como parâmetro.
- `User` — o `clientId` do histórico é sempre `session.user.id` (nunca do input).

### Índice aproveitado

`@@index([barbershopId, occurredAt])` (F005) — usado pelo range de período nas agregações (D3) e
pela ordenação/keyset da listagem (D8). Nenhum índice novo.

---

## DTOs de leitura (view models — em memória, serializados Server→Client)

> Regra transversal: **dinheiro sai como `string`** (Decimal serializado com `.toString()`, D5);
> **instantes saem como ISO string** (`occurredAt.toISOString()`), formatados no fuso da barbearia
> na exibição.

### Caixa (US1) — `CashSummaryDTO`

```text
CashSummaryDTO {
  period: { granularity: 'day'|'week'|'month'|'year', startUtcIso: string, endUtcIso: string,
            label: string }   // label já formatado no fuso da barbearia (ex.: "julho/2026")
  totals: {
    income:  string   // Decimal → string ; COALESCE 0 → "0.00"
    expense: string
    balance: string   // income - expense (Decimal) ; pode ser negativo
  }
}
```

### Breakdown (US2) — parte do mesmo retorno de caixa

```text
BreakdownDTO {
  incomeByPaymentMethod: { key: 'CASH'|'PIX'|'CARD'|'ONLINE'|'OTHER'|'UNSET', amount: string }[]
  expenseByCategory:     { key: string|null (null = "sem categoria"),          amount: string }[]
  // Invariante (FR-009/SC-004): Σ incomeByPaymentMethod = totals.income ;
  //                             Σ expenseByCategory     = totals.expense
}
```

> `UNSET` representa `paymentMethod = null` ("não informado"). Rótulos pt-BR ("Dinheiro", "Pix",
> "Cartão", "Online", "Outro", "Não informado", "Sem categoria") são aplicados na camada de UI.

### Linha do razão (US3) — `LedgerRowDTO`

```text
LedgerRowDTO {
  id: string
  occurredAtIso: string
  type: 'INCOME'|'EXPENSE'          // dá o sinal visual (não há amount negativo)
  origin: 'BOOKING'|'WALK_IN'|'EXPENSE'
  description: string
  paymentMethod: 'CASH'|'PIX'|'CARD'|'ONLINE'|'OTHER'|null
  amount: string                   // sempre positivo
  isActive: boolean                // false → renderizado como "inativo" (auditoria)
  items: { description: string, amount: string }[]   // vazio p/ despesa
}

LedgerPageDTO {
  rows: LedgerRowDTO[]                        // até pageSize (10)
  nextCursor: { occurredAtIso: string, id: string } | null   // null = fim (hasMore=false)
}
```

### Filtros do razão (US3) — `LedgerFilter` (entrada, validada no servidor)

```text
LedgerFilter {
  period?: { granularity, referenceLocalDate: 'YYYY-MM-DD' }  // → range occurredAt (D3)
  type?: 'INCOME'|'EXPENSE'
  origin?: 'BOOKING'|'WALK_IN'|'EXPENSE'
  paymentMethod?: 'CASH'|'PIX'|'CARD'|'ONLINE'|'OTHER'|'UNSET'  // UNSET → paymentMethod: null
  category?: string | 'UNSET'                                   // UNSET → category: null
  includeInactive?: boolean   // default false
}
```

> Todos os campos são **whitelist** (enums/campos conhecidos); combinados em conjunção (D9). Cursor
> e filtros são validados no servidor antes de compor o `where` (Princípio I).

### Histórico do cliente (US5) — `ClientHistoryRowDTO`

```text
ClientHistoryRowDTO {
  id: string
  occurredAtIso: string
  description: string
  amount: string
  items: { description: string, amount: string }[]
}

ClientHistoryPageDTO {
  rows: ClientHistoryRowDTO[]
  nextCursor: { occurredAtIso: string, id: string } | null
}
```

> Sempre `type=INCOME`, `isActive=true`, `clientId = sessão`. Sem `type`/`paymentMethod`/`origin` na
> saída (o cliente vê só o próprio gasto — FR-020).

---

## Regras de validação/invariantes (derivadas da spec)

- **Escopo de agregação**: `isActive=true` + `barbershopId` sempre (FR-004/D7). Inativos nunca em
  total/saldo/balde (SC-002).
- **Zeros**: período vazio → `"0.00"` em todos os campos (FR-005/D4).
- **Soma = total**: Σ baldes = total correspondente; `balance = income − expense` (FR-009/FR-024/
  SC-004), tudo em `Decimal`.
- **Fuso**: limites de período no fuso da barbearia; semana ISO (segunda) — FR-003/D2/D3.
- **Keyset determinístico**: `(occurredAt, id)` desc; sem repetição/salto sob empate (FR-011/SC-006).
- **Propriedade do histórico**: `clientId` = sessão, nunca do input (FR-021/SC-011).
- **Reuso intacto**: inativação = `deactivateLedgerEntry` da F005 sem mudança (FR-016/FR-025/D13).

## Transições de estado

Nenhuma transição nova. A única mutação é o **soft delete** existente (`isActive: true → false`),
reutilizado da F005 sem alteração (FR-016). A F006 não cria nem altera estados.
