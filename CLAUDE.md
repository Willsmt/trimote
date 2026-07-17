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

## Principios de design/produto

- Navegacao minimalista e contextual. O menu global mostra so o essencial
  por papel. Acoes aparecem no contexto onde sao usadas (ex.: apos concluir
  um atendimento, link direto para o financeiro), nao acumuladas num menu
  global. Cada feature nova deve manter as acoes principais a um clique sem
  inflar a navegacao. Simplicidade e vantagem competitiva: contra apps
  maiores, ganha-se na facilidade, nao na quantidade de opcoes.

- Convencao na mecanica, autoral na identidade. Seguir padroes estabelecidos
  de navegacao e interacao (nao reinventar onde o usuario ja sabe procurar:
  menu, login, voltar, formularios). Investir originalidade no tom das
  mensagens, na experiencia, na estetica e nas decisoes de produto - nao na
  mecanica de UI. O "artesanal" do Trimote vive na execucao e nas decisoes,
  nao em navegacao inventada.

- Rastreamento/analytics exige reavaliar LGPD ANTES do merge. O Trimote seta
  apenas cookies essenciais (NextAuth: session-token, csrf-token, callback-url,
  state, pkce) - auditados em 2026-07-11, zero rastreamento, database session
  sem dados no cliente. Adicionar Vercel Analytics, Speed Insights, Google
  Analytics, Meta Pixel ou qualquer script de terceiro que colete comportamento
  muda essa classificacao e exige atualizar a Politica de Privacidade + aviso de
  cookies ANTES de mergear. Ligar Web Analytics no dashboard da Vercel conta
  como adicionar rastreamento.

- Migration destrutiva (rename/drop) NAO pode ir num deploy so. O migrate
  deploy roda durante o build de producao, enquanto o deploy anterior ainda
  serve trafego: existe uma janela (a duracao do build) de schema novo x
  codigo velho. Migration aditiva (coluna nullable, tabela nova) sobrevive a
  janela; rename/drop derruba producao dentro dela. Destrutiva vira
  expand/contract em dois deploys: (1) adiciona o novo e escreve nos dois,
  (2) remove o velho depois que o codigo novo esta servindo. A migration
  20260703120000_rename_business deste repo e o exemplo do que NAO pode ir
  sozinho.

- O deploy de PRODUCAO exige o Neon acessivel na janela do build: o migrate
  deploy roda dentro do script build (antes do next build), e o sitemap
  consulta o banco na fase de static generation. Neon fora do ar = deploy
  BLOQUEADO, nao outage - a Vercel nao promove build quebrado e o deploy
  anterior continua servindo. E desenho (fail-closed), nao divida: nao
  "consertar" com fail-open sem decisao explicita.

- NAO adicionar URL de Preview (*.vercel.app) as Authorized redirect URIs do
  Google enquanto o Preview compartilhar DATABASE_URL e NEXTAUTH_SECRET com
  Production. Hoje o login em Preview falha com redirect_uri_mismatch
  (MEDIDO em 2026-07) - esse e o UNICO fail-closed que impede uma sessao de
  preview de escrever no banco de producao, e ele e EXTERNO ao repo (vive no
  console do Google). Se um dia precisar de login em Preview: primeiro
  desacopla o banco (Neon branch + NEXTAUTH_SECRET proprio no environment
  Preview), so depois registra a URI. Nunca ao contrario. Deployment
  Protection da Vercel esta DESLIGADA (medido: preview abre sem senha) - nao
  contar com ela como barreira.

- Grep nesta sessao passa pelo hook rtk (semantica ripgrep): ignora dotfiles
  e arquivos gitignorados por padrao, sem avisar. Grep vazio NAO e evidencia
  de ausencia - e evidencia de ausencia nos arquivos visiveis. Para auditoria
  (segredo hardcoded, credencial, config), usar rtk proxy grep -rn ... ou
  flags de hidden/no-ignore, e dizer no report qual variante foi usada. Vale
  para qualquer busca cujo alvo plausivel seja dotfile ou gitignorado.
  Medido em 17/07: grep -rn "DATABASE_URL_NEON_TEST" . retornou vazio
  enquanto o .env.neon-prod estava intacto no disco com a var. Mesma familia
  do error=Callback (#42): sucesso e falha produzindo o mesmo sinal.
