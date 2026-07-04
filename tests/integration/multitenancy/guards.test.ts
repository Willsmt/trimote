import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { resolveActiveBusiness } from "@/server/business/active-business";
import {
  DEMO_BUSINESS_ID,
  createTestBusiness,
  addMembership,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "./fixtures";

// Integração: resolução do negócio ativo e guard de dono por MEMBERSHIP (US3, FR-013/FR-014).
// 0 vínculos → empty; 1 → auto; N com hint válido → active; N sem hint → needs_selection; ADMIN sem
// vínculo também é empty (ADMIN ≠ operador — camada 5, FR-010).
const ADMIN_ID = "u-g-admin";
const OWNER1_ID = "u-g-owner1";
const OWNER2_ID = "u-g-owner2";
const CLIENT_ID = "u-g-client";
const BIZ_A = "biz-guard-a";
const BIZ_B = "biz-guard-b";

beforeAll(async () => {
  await upsertUser({ id: ADMIN_ID, email: "g-admin@example.com", role: "ADMIN" });
  await upsertUser({ id: OWNER1_ID, email: "g-owner1@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER2_ID, email: "g-owner2@example.com", role: "CLIENT" });
  await upsertUser({ id: CLIENT_ID, email: "g-client@example.com", role: "CLIENT" });
});

afterEach(async () => {
  await cleanupMembershipsAndSessions([ADMIN_ID, OWNER1_ID, OWNER2_ID, CLIENT_ID]);
  await cleanupBusinesses([BIZ_A, BIZ_B]);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, OWNER1_ID, OWNER2_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("resolveActiveBusiness (US3)", () => {
  it("0 vínculos → empty (CLIENT e ADMIN-sem-membership)", async () => {
    expect((await resolveActiveBusiness(CLIENT_ID, null)).state).toBe("empty");
    expect((await resolveActiveBusiness(ADMIN_ID, null)).state).toBe("empty"); // ADMIN não opera negócios (FR-010)
  });

  it("1 vínculo → active (auto-seleciona, ignora hint divergente)", async () => {
    await createTestBusiness({ id: BIZ_A, name: "A", slug: "guard-a" });
    await addMembership({ userId: OWNER1_ID, businessId: BIZ_A, createdBy: ADMIN_ID });
    const r = await resolveActiveBusiness(OWNER1_ID, "hint-invalido");
    expect(r).toMatchObject({ state: "active", businessId: BIZ_A });
  });

  it("N vínculos: com hint válido → active(hint); sem hint → needs_selection", async () => {
    await createTestBusiness({ id: BIZ_A, name: "A", slug: "guard-a" });
    await createTestBusiness({ id: BIZ_B, name: "B", slug: "guard-b" });
    await addMembership({ userId: OWNER1_ID, businessId: BIZ_A, createdBy: ADMIN_ID });
    await addMembership({ userId: OWNER1_ID, businessId: BIZ_B, createdBy: ADMIN_ID });

    expect(await resolveActiveBusiness(OWNER1_ID, BIZ_B)).toMatchObject({ state: "active", businessId: BIZ_B });
    expect((await resolveActiveBusiness(OWNER1_ID, null)).state).toBe("needs_selection");
    // hint para um negócio do qual NÃO é membro → não vaza; cai em needs_selection
    expect((await resolveActiveBusiness(OWNER1_ID, DEMO_BUSINESS_ID)).state).toBe("needs_selection");
  });
});
