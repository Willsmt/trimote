-- F007 ONDA 2: camada funcional multi-tenant + backfill (self-contained; migrate deploy roda tudo).

-- Enums (aditivos)
ALTER TYPE "Role" ADD VALUE 'ADMIN';
CREATE TYPE "BusinessRole" AS ENUM ('OWNER');

-- Business: slug (nullable ate o backfill), auditoria de criacao
ALTER TABLE "Business" ADD COLUMN "slug" TEXT;
ALTER TABLE "Business" ADD COLUMN "createdBy" TEXT;
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- Session: negocio ativo (estado server-side; SetNull se o negocio some)
ALTER TABLE "Session" ADD COLUMN "activeBusinessId" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeBusinessId_fkey"
  FOREIGN KEY ("activeBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BusinessMember: vinculo N:N dono<->negocio (fonte de verdade da posse)
CREATE TABLE "BusinessMember" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "role" "BusinessRole" NOT NULL DEFAULT 'OWNER',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "BusinessMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessMember_userId_businessId_key" ON "BusinessMember"("userId","businessId");
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== BACKFILL (FR-024) =====
-- 1) slug do(s) negocio(s) existente(s): derivado do nome (kebab-case), com fallback deterministico
--    (sufixo do id) se ficar vazio ou colidir com um slug reservado. A lista de reservados aqui e um
--    snapshot historico; o caminho dinamico (ADMIN) usa a constante unica RESERVED_SLUGS no codigo.
UPDATE "Business" b
SET slug = CASE
    WHEN base = '' OR base IN ('admin','api','b','booking','owner','login','my-bookings','my-spending')
      THEN base || '-' || left(b.id, 6)
    ELSE base
  END
FROM (
  SELECT id, trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) AS base
  FROM "Business"
) d
WHERE b.id = d.id AND b.slug IS NULL;

-- 2) slug agora obrigatorio
ALTER TABLE "Business" ALTER COLUMN "slug" SET NOT NULL;

-- 3) OWNER atual (role global) ganha vinculo BusinessMember (createdBy = self; backfill), no negocio
--    unico existente. CROSS JOIN e seguro no MVP (uma barbearia).
INSERT INTO "BusinessMember" ("id","userId","businessId","role","createdAt","createdBy")
SELECT gen_random_uuid()::text, u.id, b.id, 'OWNER', CURRENT_TIMESTAMP, u.id
FROM "User" u CROSS JOIN "Business" b
WHERE u.role = 'OWNER';

-- 4) OWNER sai da autoridade do Role global: rebaixa a CLIENT (posse vive em BusinessMember — D4).
UPDATE "User" SET role = 'CLIENT' WHERE role = 'OWNER';
