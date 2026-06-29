<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-barber-booking/plan.md`

Active feature: 001-barber-booking — Next.js 16 (App Router, TypeScript) + PostgreSQL/Prisma +
NextAuth (Google OAuth). Non-overlap guaranteed at the data layer via PostgreSQL exclusion
constraint (EXCLUDE USING gist on tstzrange, btree_gist), applied through a manual SQL migration.
All instants stored in UTC; availability/conflict logic runs in America/Sao_Paulo.
<!-- SPECKIT END -->
