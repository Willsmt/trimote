<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/007-multi-tenancy/plan.md`

Active feature: 007-multi-tenancy — negócios, donos e administração. Transforma o Trimote de barbearia
única em plataforma multi-tenant. DUAS migrations em ordem: (1) RENAME PURO Barbershop→Business,
BarbershopService→Service, barbershopId→businessId em todas as tabelas + coluna segment (SQL
hand-edited via --create-only com ALTER TABLE RENAME — preserva dados/indices/exclusion constraint;
o Prisma gerado ingenuamente faria DROP+CREATE), zero lógica; (2) FUNCIONAL: Role += ADMIN,
BusinessMember (N:N, @@unique[userId,businessId], createdBy auditado, enum BusinessRole nasce só com
OWNER), Business.slug @unique, Session.activeBusinessId, backfill (negócio existente ganha slug, OWNER
atual ganha membership, willmarthins vira ADMIN via seed). GATE entre as etapas: pg_constraint prova
booking_no_overlap por businessId + 139 testes verdes. Anti-escalação 5 camadas: sem caminho público
p/ escrever User.role/BusinessMember; requireAdmin (User.role do banco) vs requireOwner (valida
membership do negócio ATIVO); ADMIN só promove a OWNER; businessId NUNCA do input (deriva de
getActiveBusiness = Session.activeBusinessId revalidado por request); ADMIN não opera negócios de
terceiros. OWNER sai da autoridade do Role global (posse vive em BusinessMember; valor de enum
permanece por custo de migração). Novo: /admin, /b/[slug] (notFound se invalido), seletor de negócio
ativo, rótulo de negócio em /my-bookings e /my-spending. Regressão dos 139 é critério de DESIGN.
Fora de escopo: STAFF real, visual, marketplace, cobrança, multi-vertical, edição de slug.

Previous feature: 006-financial-reports — financeiro: balancete e histórico. LEITURA PURA sobre o razão
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

## Regras sempre ativas

- Grep nesta sessão passa pelo hook rtk (semântica ripgrep): ignora dotfiles e arquivos gitignorados por padrão, sem avisar. Grep vazio NÃO é evidência de ausência — é evidência de ausência nos arquivos visíveis. Para auditoria (segredo hardcoded, credencial, config), usar rtk proxy grep -rn ... ou flags de hidden/no-ignore, e dizer no report qual variante foi usada. Medido em 17/07: grep de DATABASE_URL_NEON_TEST retornou vazio com o .env.neon-prod intacto no disco.
- Rastreamento/analytics exige reavaliar LGPD ANTES do merge. O Trimote seta apenas cookies essenciais (NextAuth; auditado 2026-07-11, zero rastreamento). Adicionar Vercel Analytics, Speed Insights, GA, Meta Pixel ou qualquer script de terceiro que colete comportamento muda essa classificação e exige atualizar Política de Privacidade + aviso de cookies ANTES de mergear. Ligar Web Analytics no dashboard da Vercel conta como adicionar rastreamento.

## Convenções

- Conventional Commits (commitlint ativo). Branch de issue `NNN-nome` criada ANTES do primeiro commit; merge via `--no-ff`. Código em inglês, docs/comentários em português. README atualizado a cada feature ou dependência nova.

## Arquitetura de contexto

- Regras específicas por área vivem em `.claude/skills/trimote-*` e são carregadas sob demanda pelo gatilho de cada skill. Ao criar regra nova, prefira adicioná-la à skill do domínio correspondente (ou criar uma nova) em vez de inflar este arquivo.
- Governança formal: `.specify/memory/constitution.md` (prevalece sobre tudo).
