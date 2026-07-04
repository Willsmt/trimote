import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { resolveActiveBusiness } from "@/server/business/active-business";

// Teste de integração — guard de DONO por MEMBERSHIP (007, reescrito da F002). A fonte de verdade da
// posse é BusinessMember, lida do banco; um não-membro (CLIENT) não resolve negócio ativo, um membro
// OWNER sim. (Princípio I / FR-013)
const NON_MEMBER_ID = "u-guard-nonmember";
const MEMBER_ID = "u-guard-member";
const BIZ_ID = "biz-guard-authz";

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: NON_MEMBER_ID, email: "guard-nonmember@example.com", role: "CLIENT" },
      { id: MEMBER_ID, email: "guard-member@example.com", role: "CLIENT" },
    ],
    skipDuplicates: true,
  });
  await prisma.business.upsert({
    where: { id: BIZ_ID },
    update: {},
    create: { id: BIZ_ID, name: "Guard Biz", slug: "guard-authz", timezone: "America/Sao_Paulo" },
  });
  await prisma.businessMember.upsert({
    where: { userId_businessId: { userId: MEMBER_ID, businessId: BIZ_ID } },
    update: {},
    create: { userId: MEMBER_ID, businessId: BIZ_ID, role: "OWNER", createdBy: MEMBER_ID },
  });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: BIZ_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [NON_MEMBER_ID, MEMBER_ID] } } });
  await prisma.$disconnect();
});

describe("guard de dono por membership (resolveActiveBusiness)", () => {
  it("nega um não-membro (CLIENT) — estado empty (sem negócio ativo)", async () => {
    const r = await resolveActiveBusiness(NON_MEMBER_ID, null);
    expect(r.state).toBe("empty");
  });

  it("admite um membro OWNER — negócio ativo resolvido a partir do vínculo", async () => {
    const r = await resolveActiveBusiness(MEMBER_ID, null);
    expect(r).toMatchObject({ state: "active", businessId: BIZ_ID });
  });

  it("trata usuário sem vínculo como sem acesso operacional (empty)", async () => {
    const r = await resolveActiveBusiness("u-does-not-exist", null);
    expect(r.state).toBe("empty");
  });
});
