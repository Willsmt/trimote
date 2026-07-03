-- F007 ONDA 1: rename puro Barbershop->Business, BarbershopService->Service, barbershopId->businessId.
-- Zero logica/dados. Usa ALTER ... RENAME (Postgres preserva dados, indices, FKs e a exclusion
-- constraint booking_no_overlap) — NUNCA DROP/CREATE. Ver research D1/D2 e plan (item 1).

-- Tabelas
ALTER TABLE "Barbershop" RENAME TO "Business";
ALTER TABLE "BarbershopService" RENAME TO "Service";

-- Colunas barbershopId -> businessId (em todas as tabelas que referenciam o negocio)
ALTER TABLE "OpeningHours" RENAME COLUMN "barbershopId" TO "businessId";
ALTER TABLE "Service" RENAME COLUMN "barbershopId" TO "businessId";
ALTER TABLE "Booking" RENAME COLUMN "barbershopId" TO "businessId";
ALTER TABLE "LedgerEntry" RENAME COLUMN "barbershopId" TO "businessId";

-- Nova coluna segment (default barbershop; sem ramificacao de comportamento no MVP)
ALTER TABLE "Business" ADD COLUMN "segment" TEXT NOT NULL DEFAULT 'barbershop';

-- Primary keys (nomes que o Prisma espera apos o rename)
ALTER TABLE "Business" RENAME CONSTRAINT "Barbershop_pkey" TO "Business_pkey";
ALTER TABLE "Service" RENAME CONSTRAINT "BarbershopService_pkey" TO "Service_pkey";

-- Foreign keys
ALTER TABLE "OpeningHours" RENAME CONSTRAINT "OpeningHours_barbershopId_fkey" TO "OpeningHours_businessId_fkey";
ALTER TABLE "Service" RENAME CONSTRAINT "BarbershopService_barbershopId_fkey" TO "Service_businessId_fkey";
ALTER TABLE "Booking" RENAME CONSTRAINT "Booking_barbershopId_fkey" TO "Booking_businessId_fkey";
ALTER TABLE "LedgerEntry" RENAME CONSTRAINT "LedgerEntry_barbershopId_fkey" TO "LedgerEntry_businessId_fkey";

-- Indices
ALTER INDEX "OpeningHours_barbershopId_weekday_key" RENAME TO "OpeningHours_businessId_weekday_key";
ALTER INDEX "Booking_barbershopId_status_idx" RENAME TO "Booking_businessId_status_idx";
ALTER INDEX "LedgerEntry_barbershopId_occurredAt_idx" RENAME TO "LedgerEntry_businessId_occurredAt_idx";
-- Indice parcial manual (unicidade de nome de servico ativo) — nao rastreado pelo Prisma; renomeado por higiene.
ALTER INDEX "barbershopservice_active_name_key" RENAME TO "service_active_name_key";
