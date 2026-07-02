<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/006-financial-reports/plan.md`

Active feature: 006-financial-reports — financeiro: balancete e histórico. LEITURA PURA sobre o razão
da F005 (nenhuma migração, nenhuma entidade nova, nenhum write path). OWNER vê o caixa por período
(entradas/saídas/saldo) + breakdown por forma de pagamento e por categoria (US1/US2), e navega o razão
paginado por keyset com filtros combináveis (US3); cada linha ativa oferece inativar reutilizando o
soft delete da F005 SEM MUDANÇA (US4). CLIENT vê o histórico dos próprios gastos, clientId SEMPRE da
sessão (US5). Agregações via prisma.$queryRaw TIPADO e PARAMETRIZADO (não groupBy): fuso da barbearia
(Barbershop.timezone, mesma fonte da F001) via AT TIME ZONE $tz; limites de período derivados uma vez
(fuso→UTC) e usados como range no WHERE para preservar o índice (barbershopId, occurredAt) da F005 —
nunca função sobre occurredAt. Listagem/histórico por findMany com keyset (occurredAt, id) desc,
take=pageSize+1. Dinheiro em Prisma.Decimal, serializado p/ string na fronteira Server/Client.
requireOwner p/ caixa/razão/inativação; requireUser p/ histórico. NENHUM core da F005 é alterado.

Previous feature: 005-financial-ledger — captura de lançamentos (LedgerEntry/LedgerEntryItem, enums
LedgerType/LedgerOrigin/PaymentMethod; estado terminal COMPLETED no Booking). Conclusão gera receita
com snapshot de preço na mesma transação; walk-in sem agenda; despesa sem itens; correção por soft
delete (isActive). Guard requireOwner (F002); dinheiro em Decimal; índice (barbershopId, occurredAt).

Earlier feature: 003-nav-session — navegação e sessão. Header único no layout raiz; links por papel
decididos NO SERVIDOR (getNavSession lê role do banco por requisição). Visibilidade é conveniência,
não barreira; requireOwner e o lockdown de /owner (002) garantem o bloqueio.

Earlier feature: 002-owner-panel — painel do dono (serviços/horários). Autorização por `role` via
requireOwner; soft delete via `isActive`; unicidade de nome entre ativos por índice único parcial.

Earlier feature: 001-barber-booking — agendamento com não-sobreposição por exclusion constraint
(EXCLUDE USING gist on tstzrange, btree_gist). UTC no armazenamento; lógica no fuso da barbearia.
<!-- SPECKIT END -->
