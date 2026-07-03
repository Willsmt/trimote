# Quickstart / Validation: Multi-tenancy (F007)

Roteiro de validação. A F007 é sequenciada em **duas ondas** (rename → funcional) com a **regressão
dos 139** como gate. Detalhes de contrato em `contracts/`; modelo em `data-model.md`.

## Pré-requisitos

- Stack rodando: Postgres `:5433` (`docker compose up -d`), `.env`, migrations aplicadas, seed.
- Base atual com um negócio (a barbearia de seed) + dados de F001–F006.
- `npm install` (nenhuma dependência nova).

## Onda 1 — Rename (migration 1, zero lógica)

```bash
# 1) Editar schema.prisma (rename) e gerar a migration SEM aplicar:
npx prisma migrate dev --create-only --name rename_business
# 2) EDITAR o SQL gerado à mão: trocar DROP/CREATE por ALTER TABLE ... RENAME TO / RENAME COLUMN,
#    e adicionar a coluna segment (default 'barbershop'). NUNCA deixar o Prisma dropar tabelas.
# 3) Aplicar e regenerar o client:
npx prisma migrate dev
```

**Gate obrigatório pós-M1:**

```bash
# a) A exclusion constraint sobreviveu e referencia businessId:
docker compose exec -T postgres psql -U postgres -d trimote -c \
  "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='booking_no_overlap';"
# Esperado: EXCLUDE USING gist ("businessId" WITH =, tstzrange(...) WITH &&) WHERE (status='ACTIVE')

# b) Dados preservados (contagens iguais ao pré-rename):
docker compose exec -T postgres psql -U postgres -d trimote -c \
  'SELECT (SELECT count(*) FROM "Business") b, (SELECT count(*) FROM "Service") s,
          (SELECT count(*) FROM "Booking") bk, (SELECT count(*) FROM "LedgerEntry") le;'

# c) Regressão — 139 verdes com os nomes novos (rename tocou todo o código):
npm test
npx tsc --noEmit
```

**Só avançar para a onda 2 com (a) OK, (b) contagens preservadas e (c) 139 verdes.**

## Onda 2 — Funcional (migration 2 + backfill)

```bash
# schema.prisma: enum Role += ADMIN; enum BusinessRole { OWNER }; model BusinessMember;
# Business.slug @unique; Session.activeBusinessId. Backfill no corpo da migration (SQL) ou script.
npx prisma migrate dev --name multitenancy
# Bootstrap do 1o ADMIN (documentado, idempotente):
npx prisma db seed   # promove willmarthins@gmail.com -> ADMIN
```

**Validação pós-M2 (backfill — SC-005):**

```bash
docker compose exec -T postgres psql -U postgres -d trimote -c \
  'SELECT slug FROM "Business";                         -- negocio existente com slug
   SELECT count(*) FROM "BusinessMember";               -- owner atual vinculado
   SELECT email, role FROM "User" WHERE role = '"'"'ADMIN'"'"';'  -- operador ADMIN
# Bookings/LedgerEntry/Service seguem com o mesmo businessId (nada re-associado).
```

## Testes de integração (test-first)

```bash
npm test -- tests/integration/multitenancy/
```

| Cenário | SC | Onde |
|---|---|---|
| `requireAdmin` nega não-ADMIN; admite ADMIN | SC-003 | guards |
| `requireOwner` nega não-membro; admite membro OWNER do negócio ativo | SC-002 | guards |
| CLIENT chama action de admin → recusado | SC-003 | anti-escalação |
| OWNER de A tenta operar B (id forjado / activeBusinessId forjado) → recusado | SC-001/SC-002 | anti-escalação |
| Não existe caminho p/ virar ADMIN nem p/ auto-promover a OWNER | SC-004 | anti-escalação |
| slug inválido / duplicado / reservado → recusado; válido → criado | SC-007 | slug |
| Backfill: dados existentes íntegros; owner com membership; operador ADMIN | SC-005 | backfill |
| booking de A e B no mesmo horário coexistem (constraint particiona) | SC-008 | isolamento |
| caixa/razão de A não somam/listam lançamento de B | SC-001 | isolamento |
| `/my-bookings` e `/my-spending` agregam 2 negócios, rotulando cada item | SC-009 | cliente global |
| `getActiveBusiness`: 1→auto, 0→empty, N>1→needs_selection | SC-010 | negócio ativo |

## Validação manual

- **ADMIN** em `/admin`: criar negócio (slug pré-preenchido do nome, editável), promover um dono por
  email; não-ADMIN → recusado/redirecionado.
- **Dono de 2 negócios**: seletor de negócio ativo troca toda a visão (serviços/caixa/razão); com 1
  negócio o seletor some; com 0, estado vazio orientando contato com o ADMIN.
- **Cliente**: `/b/[slug]` mostra serviços do negócio e agenda nele; slug inexistente → 404;
  `/my-bookings`/`/my-spending` agregam e rotulam o negócio.

## Critérios de aceite

- Onda 1: constraint preservada (pg_constraint), dados intactos, **139 verdes**, `tsc` limpo.
- Onda 2: backfill íntegro; testes novos de guard/anti-escalação/slug/isolamento verdes; **139 +
  novos** verdes; `tsc` limpo.
- `git diff` confirma que a onda 1 não mudou comportamento (só nomes) e que nenhum caminho público
  escreve `User.role`/`BusinessMember`.
- README + bootstrap do 1º ADMIN documentados.
