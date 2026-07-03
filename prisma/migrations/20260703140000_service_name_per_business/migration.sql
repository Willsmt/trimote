-- F007 US3: unicidade de nome de servico ativo passa a ser POR NEGOCIO (multi-tenant). Antes era
-- global (uma barbearia). Dois negocios podem ter "Corte". Indice parcial em isActive (reusa nome
-- de servico desativado). Nao rastreado pelo Prisma (indice manual) — ver research D4/F002.
DROP INDEX "service_active_name_key";
CREATE UNIQUE INDEX "service_active_name_key" ON "Service" ("businessId", "name") WHERE "isActive" = true;
