import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { listClientHistory } from "@/server/ledger/client-history";
import { createTestBusiness, upsertUser, cleanupBusinesses } from "./fixtures";

// Integração (Postgres): cliente GLOBAL (US5, SC-009). A conta é única; "meus gastos" agregam itens
// de todos os negócios, cada item identificando o negócio (business.name).
const CLIENT_ID = "u-cg-client";
const OWNER_ID = "u-cg-owner";
const BIZ_A = "biz-cg-a";
const BIZ_B = "biz-cg-b";
const D = (v: string) => new Prisma.Decimal(v);

beforeAll(async () => {
  await upsertUser({ id: CLIENT_ID, email: "cg-client@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_ID, email: "cg-owner@example.com", role: "CLIENT" });
  await createTestBusiness({ id: BIZ_A, name: "Negócio A", slug: "cg-a" });
  await createTestBusiness({ id: BIZ_B, name: "Negócio B", slug: "cg-b" });
});

afterEach(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { clientId: CLIENT_ID } });
});

afterAll(async () => {
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: { in: [CLIENT_ID, OWNER_ID] } } });
  await prisma.$disconnect();
});

describe("histórico do cliente agrega negócios e rotula cada item (US5)", () => {
  it("mostra receitas dos DOIS negócios, cada uma com o nome do negócio", async () => {
    await prisma.ledgerEntry.create({ data: { businessId: BIZ_A, type: "INCOME", origin: "WALK_IN", amount: D("40.00"), occurredAt: new Date("2036-01-10T13:00:00Z"), description: "Corte", clientId: CLIENT_ID, createdBy: OWNER_ID } });
    await prisma.ledgerEntry.create({ data: { businessId: BIZ_B, type: "INCOME", origin: "WALK_IN", amount: D("50.00"), occurredAt: new Date("2036-01-11T13:00:00Z"), description: "Barba", clientId: CLIENT_ID, createdBy: OWNER_ID } });

    const r = await listClientHistory({ userId: CLIENT_ID });
    expect(r.rows).toHaveLength(2);
    // mais recente primeiro: B depois A
    expect(r.rows[0].businessName).toBe("Negócio B");
    expect(r.rows[1].businessName).toBe("Negócio A");
  });
});
