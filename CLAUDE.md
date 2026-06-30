<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/002-owner-panel/plan.md`

Active feature: 002-owner-panel — painel do dono para gerenciar serviços e horários. Reusa a stack
da 001 (Next.js 16, Prisma, NextAuth Google, Postgres :5433, Luxon). Autorização por `role`
(CLIENT|OWNER) no User, verificada no servidor por um guard único `requireOwner`. Soft delete de
serviço via `isActive`; unicidade de nome entre ativos por índice único parcial (SQL manual).
Bookings existentes protegidos por design (endsAt materializado; disponibilidade derivada).

Previous feature: 001-barber-booking — agendamento com não-sobreposição garantida por exclusion
constraint (EXCLUDE USING gist on tstzrange, btree_gist). Armazenamento em UTC; lógica em
America/Sao_Paulo.
<!-- SPECKIT END -->
