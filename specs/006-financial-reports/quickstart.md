# Quickstart / Validation: Financeiro — Balancete e Histórico (F006)

Roteiro de validação da F006 (leitura pura). Prova US1–US5 e os SC-001..SC-012. **Não** há migração:
o banco é o da F005. Detalhes de assinatura em `contracts/`; modelo de dados em `data-model.md`.

## Pré-requisitos

- Stack da F005 rodando: Postgres em `:5433` (`docker compose up -d`), `.env` configurado,
  `npx prisma migrate deploy` (ou `dev`) e `npx prisma db seed` já aplicados (barbearia
  `barbershop-trimote`, serviços, expediente).
- Dependências instaladas (`npm install`) — nenhuma nova.
- Um usuário **OWNER** e ao menos dois **CLIENT** para os testes de histórico.

## Passo 0 — Confirmar que nada da F005 foi tocado

```bash
git diff --stat -- src/server/ledger/complete-booking.ts \
  src/server/ledger/register-walk-in.ts src/server/ledger/register-expense.ts \
  src/server/ledger/ledger-items.ts src/server/ledger/deactivate-ledger-entry.ts \
  src/server/actions/deactivate-ledger-entry.ts
# Esperado: SEM saída (0 arquivos alterados) — reuso intacto (FR-025/D13).
```

## Passo 1 — Testes de integração (test-first) do lado servidor

```bash
npm test -- tests/integration/ledger/cash-summary.test.ts
npm test -- tests/integration/ledger/ledger-list.test.ts
npm test -- tests/integration/ledger/client-history.test.ts
```

Cobertura esperada (verde ao final; RED antes da implementação de cada core):

| Cenário | SC | Onde |
|---|---|---|
| Totais entradas/saídas/saldo do período (saldo pode ser negativo) | SC-001 | cash-summary |
| Inativo não conta em total/saldo/balde | SC-002 | cash-summary |
| Borda de fuso: 22h/23h local perto da virada UTC cai no dia/semana/mês/ano local | SC-003 | cash-summary |
| Σ baldes = total (forma de pagamento e categoria); balde `null` → "não informado"/"sem categoria" | SC-004 | cash-summary |
| Período vazio → zeros, sem erro | SC-005 | cash-summary |
| Keyset: mais recentes primeiro; sem repetir/pular com `occurredAt` empatado | SC-006 | ledger-list |
| Filtros combináveis em conjunção (período+tipo+origem+forma+categoria) | SC-007 | ledger-list |
| Inativos ocultos por padrão; visíveis e marcados sob "mostrar inativos"; nunca em total | SC-008 | ledger-list |
| Inativar qualquer linha (não só a última) via action da F005; caixa/lista refletem; booking segue concluído | SC-009 | ledger-list (+ reuso) |
| Histórico só receitas ativas do cliente; não vaza despesas/outros/anônimos/inativos | SC-010 | client-history |
| `clientId` do input é ignorado (filtro = sessão); não-OWNER recusado no razão/caixa | SC-011 | client-history + ledger-list |
| Somas exatas em 2 casas decimais (sem float) | SC-012 | cash-summary |

### Fixtures-chave (borda de fuso — SC-003)

Semear lançamentos com `occurredAt` em instantes UTC que correspondam a **22h e 23h locais** de um
dia em `America/Sao_Paulo` (usar `slotAt(dateISO, minutes)` de `fixtures.ts`, ex.: `22*60`, `23*60`),
e asseverar que caem no **dia local** e não no dia UTC seguinte, para as quatro granularidades.

## Passo 2 — Validação manual do OWNER (US1–US4)

```bash
npm run dev
```

1. Autenticado como **OWNER**, abrir `/owner/finance`.
   - Abre no **mês corrente**; mostra entradas, saídas e **saldo** (US1). Período sem lançamentos →
     zeros (SC-005). Navegar anterior/próximo recalcula (SC-001).
2. Conferir o **breakdown** (US2): soma das formas de pagamento = entradas; soma das categorias =
   saídas; receitas sem forma em "não informado"; despesas sem categoria em "sem categoria" (SC-004).
3. Abrir o **razão** (US3): 10 mais recentes + "carregar mais" (sem repetir/pular). Aplicar filtros
   combinados. Expandir uma linha de receita → itens. Ativar "mostrar inativos" → inativos marcados.
4. Numa linha **ativa** (que **não** seja o último lançamento criado), usar **"Inativar (corrigir)"**
   (US4): a linha some da lista padrão, o caixa/breakdown recalculam, e um lançamento de origem
   agendamento **não** reabre o booking (SC-009). Reusa a action da F005 sem mudança.

## Passo 3 — Validação manual do CLIENT (US5)

1. Autenticado como **CLIENT A**, abrir `/my-spending`.
   - Vê só as **próprias receitas ativas** (agendamento concluído + walk-in identificado), mais
     recentes primeiro, com momento/descrição/itens/valor. "Carregar mais" pagina (SC-010).
2. Confirmar que **não** aparecem: despesas da barbearia, receitas do **CLIENT B**, walk-ins
   anônimos, nem lançamentos inativos (SC-010).
3. (Segurança) Tentar forjar um `clientId` na chamada da action `listMyLedger` — a assinatura não
   aceita `clientId`; o filtro usa **sempre** a sessão (SC-011).

## Passo 4 — Autorização (SC-011)

- Visitante em `/owner/finance` → redirecionado ao login. **CLIENT** em `/owner/finance` →
  redirecionado à home (`requireOwner`, FR-022). `/my-spending` exige apenas sessão (`requireUser`).

## Passo 5 — Suíte completa e tipos

```bash
npm test            # toda a suíte verde (F005 intacta + novos testes da F006)
npx tsc --noEmit    # sem erros de tipo
```

## Critérios de aceite do plano

- `git diff` do Passo 0 vazio (nenhum core/action da F005 alterado).
- Todos os cenários da tabela do Passo 1 verdes.
- US1–US5 validadas manualmente; autorização confirmada.
- README atualizado com a visão de balancete/histórico (Princípio V).
