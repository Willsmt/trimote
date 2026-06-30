<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/003-nav-session/plan.md`

Active feature: 003-nav-session — navegação e sessão. Header único no layout raiz (app/layout.tsx)
que aparece em todas as páginas; ações "Entrar" (signIn Google) / "Sair" (signOut) e links por papel
(visitante/CLIENT/OWNER) + indicação de quem está logado. A decisão de quais links mostrar é feita
NO SERVIDOR: a navegação lê a sessão (getServerSession via src/server/auth/session.ts) e o `role`
da MESMA fonte de verdade do requireOwner (role lido do banco por requisição), refletindo o papel
atual, não um claim cacheado. Visibilidade de link é conveniência, NÃO barreira: requireOwner e o
lockdown de /owner (002) permanecem intactos e garantem o bloqueio (SC-005). Sem estética/redesign;
sem teste de domínio novo. Helper novo getNavSession() em session.ts; ilha client mínima só para
os botões (auth-buttons.tsx); header server (site-header.tsx).

Previous feature: 002-owner-panel — painel do dono para gerenciar serviços e horários. Reusa a stack
da 001 (Next.js 16, Prisma, NextAuth Google, Postgres :5433, Luxon). Autorização por `role`
(CLIENT|OWNER) no User, verificada no servidor por um guard único `requireOwner`. Soft delete de
serviço via `isActive`; unicidade de nome entre ativos por índice único parcial (SQL manual).
Bookings existentes protegidos por design (endsAt materializado; disponibilidade derivada).

Earlier feature: 001-barber-booking — agendamento com não-sobreposição garantida por exclusion
constraint (EXCLUDE USING gist on tstzrange, btree_gist). Armazenamento em UTC; lógica em
America/Sao_Paulo.
<!-- SPECKIT END -->
