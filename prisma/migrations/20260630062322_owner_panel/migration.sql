-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'OWNER');

-- AlterTable
ALTER TABLE "BarbershopService" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'CLIENT';

-- ===========================================================================
-- SQL MANUAL (Princípio II / FR-012 / FR-013) — unicidade de nome entre serviços ATIVOS.
-- O Prisma não expressa índice único parcial no schema.prisma; este índice é adicionado à mão
-- (research.md D4). Parcial em isActive=true => permite reusar o nome de um serviço desativado.
-- ===========================================================================
CREATE UNIQUE INDEX "barbershopservice_active_name_key"
  ON "BarbershopService" ("name")
  WHERE "isActive" = true;
