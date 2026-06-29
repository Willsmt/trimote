# Phase 1 — Data Model: Agendamento Online de Barbearia (MVP)

Modelo de dados para PostgreSQL via Prisma. Nomes de objetos em inglês (Princípio V). Todos os
instantes em UTC (`timestamptz`); cálculo em `America/Sao_Paulo` é responsabilidade da camada de
domínio, não do banco.

## Entidades

### User / Account / Session (NextAuth)

Tabelas padrão do Prisma adapter do NextAuth. `User` é o dono (owner) de seus `Booking`. Atributos
relevantes ao MVP: `id`, `email`, `name`. `Account`/`Session` suportam o login Google OAuth. Não são
detalhados aqui além do padrão do adapter.

### Barbershop

Representa a (única) barbearia do MVP.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | string (cuid) | PK |
| `name` | string | obrigatório |
| `timezone` | string | IANA timezone; default `America/Sao_Paulo` |

- Relacionamentos: 1–N com `OpeningHours`, `BarbershopService`, `Booking`.

### OpeningHours

Horário de funcionamento por dia da semana (entidade "Horário de Funcionamento" da spec).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | string (cuid) | PK |
| `barbershopId` | string | FK → Barbershop |
| `weekday` | int (0–6) | 0 = domingo … 6 = sábado |
| `opensAtMinutes` | int | hora local de abertura em minutos desde a meia-noite (America/Sao_Paulo); ex.: 09:00 = 540 |
| `closesAtMinutes` | int | hora local de fechamento em minutos desde a meia-noite; `closesAtMinutes > opensAtMinutes` |

- Restrições: `UNIQUE (barbershopId, weekday)` no MVP (uma janela contínua por dia).
- Ausência de linha para um `weekday` ⇒ barbearia fechada nesse dia (sem slots — FR-005, edge "dia sem
  expediente").
- **Representação do horário**: usamos minutos desde a meia-noite (Int) em vez de `TIME`. É uma hora
  local "sem fuso" consumida diretamente pela lógica de domínio pura, evitando ambiguidade de fuso na
  conversão; a conversão para instante UTC ocorre na camada `src/domain/time` (Princípio VII).

### BarbershopService

Serviço oferecido (pré-cadastrado).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | string (cuid) | PK |
| `barbershopId` | string | FK → Barbershop |
| `name` | string | obrigatório |
| `price` | `Decimal` (`@db.Decimal(10,2)`) | preço monetário; NUMERIC, **nunca** float (Princípio II — precisão) |
| `durationMinutes` | int | > 0; usado para derivar o fim do agendamento |

- **Preço**: usar `Decimal` mapeado a `NUMERIC`/`@db.Decimal(10,2)` — nunca ponto flutuante. Exibição
  formatada na camada de UI.

### Booking

Reserva de um cliente para um serviço em um instante de início.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | string (cuid) | PK |
| `barbershopId` | string | FK → Barbershop (chave de partição da exclusion constraint) |
| `userId` | string | FK → User (owner) |
| `serviceId` | string | FK → BarbershopService |
| `startsAt` | `timestamptz` (UTC) | instante de início, armazenado em UTC |
| `endsAt` | `timestamptz` (UTC) | = `startsAt` + `service.durationMinutes`; persistido para indexar o range |
| `status` | enum `BookingStatus` | `ACTIVE` \| `CANCELLED` (soft delete; sem delete físico) |
| `createdAt` | `timestamptz` | default now |
| `cancelledAt` | `timestamptz?` | preenchido ao cancelar |

#### Invariantes / Constraints (nível de dados — Princípio II)

1. **Não-sobreposição** (FR-008, FR-009): exclusion constraint parcial garantindo que dois bookings
   **ativos** da mesma barbearia não tenham `tstzrange(startsAt, endsAt, '[)')` sobreposto.

   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;

   ALTER TABLE "Booking"
     ADD CONSTRAINT booking_no_overlap
     EXCLUDE USING gist (
       "barbershopId" WITH =,
       tstzrange("startsAt", "endsAt", '[)') WITH &&
     )
     WHERE (status = 'ACTIVE');
   ```

   Implementada por **migration SQL manual** (Prisma não modela exclusion constraints). A condição
   parcial `WHERE status = 'ACTIVE'` permite reuso do horário após cancelamento (FR-013).

2. **Consistência `endsAt`**: `endsAt = startsAt + durationMinutes` — calculado na aplicação no momento
   da criação, dentro da transação (a duração pode mudar no catálogo, mas o booking fixa a sua).
   Garantido por `CHECK ("endsAt" > "startsAt")` na migration (T010).

3. **Ownership** (FR-010..FR-012): leitura/cancelamento sempre filtram por `userId` da sessão; a app
   nunca aceita `userId` vindo do cliente.

#### Transições de estado

```text
(criação) ──> ACTIVE ──cancel──> CANCELLED
```

- Só `ACTIVE` pode ir para `CANCELLED` (FR-011/FR-013). `CANCELLED` é terminal.
- Cancelar = `status := CANCELLED`, `cancelledAt := now`. Como a exclusion constraint é parcial em
  `ACTIVE`, o cancelamento libera o intervalo automaticamente.

### Enum

```text
BookingStatus = { ACTIVE, CANCELLED }
```

## Regras derivadas de requisitos

| Requisito | Onde é garantido |
|-----------|------------------|
| FR-004/FR-005 (slot cabe no expediente) | Domínio puro (availability) usando `OpeningHours` |
| FR-006 (sem passado) | Domínio puro (`now` em America/Sao_Paulo); reforçado na criação |
| FR-008/FR-009 (não-sobreposição/concorrência) | Exclusion constraint no Postgres |
| FR-013 (cancelar libera horário) | `status` parcial na exclusion constraint |
| FR-014 (UTC armazena / SP calcula) | `timestamptz` + camada `src/domain/time` |

## Seed (dados pré-cadastrados)

`prisma/seed.ts` cria: 1 `Barbershop`, suas `OpeningHours` (por weekday) e um conjunto de
`BarbershopService` (nome, preço, duração). Necessário para a jornada do MVP, já que não há painel do
dono (escopo).
