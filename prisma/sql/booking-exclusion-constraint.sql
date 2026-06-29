-- Não-sobreposição garantida no nível de dados (Princípio II / FR-008 / FR-009).
--
-- O Prisma NÃO modela exclusion constraints no schema.prisma, então este SQL é inserido
-- MANUALMENTE no final da migration gerada (research.md D1/D8). Dois agendamentos ATIVOS da
-- mesma barbearia não podem ter intervalos [startsAt, endsAt) sobrepostos.
--
-- Detalhes:
--  - btree_gist permite combinar igualdade ("barbershopId" WITH =) com sobreposição de range.
--  - Intervalo semiaberto '[)' => fim 10:00 e início 10:00 NÃO conflitam (adjacência válida).
--  - Constraint parcial (WHERE status = 'ACTIVE') => cancelar libera o horário (FR-013).
--  - CHECK garante a consistência do intervalo materializado (endsAt > startsAt).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_ends_after_starts CHECK ("endsAt" > "startsAt");

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "barbershopId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status = 'ACTIVE');
