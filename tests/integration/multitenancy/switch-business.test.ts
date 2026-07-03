import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { switchActiveBusiness } from "@/server/business/switch-business";
import {
  createTestBusiness,
  addMembership,
  createSession,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "./fixtures";

// Integração (Postgres) da troca de negócio ativo (US2, FR-018/SC-010). É estado de sessão server-side;
// só troca para um negócio do qual o usuário é MEMBRO (revalidação — anti-IDOR).
const OWNER_ID = "u-sw-owner";
const BIZ_A = "biz-sw-a";
const BIZ_B = "biz-sw-b";
const OUTSIDER_BIZ = "biz-sw-out";
const TOKEN = "sw-session-token";

beforeAll(async () => {
  await upsertUser({ id: OWNER_ID, email: "sw-owner@example.com", role: "CLIENT" });
});

afterEach(async () => {
  await cleanupMembershipsAndSessions([OWNER_ID]);
  await cleanupBusinesses([BIZ_A, BIZ_B, OUTSIDER_BIZ]);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

describe("switchActiveBusiness (US2)", () => {
  it("membro troca o negócio ativo (grava Session.activeBusinessId)", async () => {
    await createTestBusiness({ id: BIZ_A, name: "A", slug: "sw-a" });
    await createTestBusiness({ id: BIZ_B, name: "B", slug: "sw-b" });
    await addMembership({ userId: OWNER_ID, businessId: BIZ_A, createdBy: OWNER_ID });
    await addMembership({ userId: OWNER_ID, businessId: BIZ_B, createdBy: OWNER_ID });
    await createSession({ userId: OWNER_ID, sessionToken: TOKEN, activeBusinessId: BIZ_A });

    const r = await switchActiveBusiness({ userId: OWNER_ID, sessionToken: TOKEN, businessId: BIZ_B });
    expect(r).toEqual({ ok: true });
    const s = await prisma.session.findUniqueOrThrow({ where: { sessionToken: TOKEN } });
    expect(s.activeBusinessId).toBe(BIZ_B);
  });

  it("troca para negócio do qual NÃO é membro → not_member, não grava", async () => {
    await createTestBusiness({ id: BIZ_A, name: "A", slug: "sw-a" });
    await createTestBusiness({ id: OUTSIDER_BIZ, name: "Out", slug: "sw-out" });
    await addMembership({ userId: OWNER_ID, businessId: BIZ_A, createdBy: OWNER_ID });
    await createSession({ userId: OWNER_ID, sessionToken: TOKEN, activeBusinessId: BIZ_A });

    const r = await switchActiveBusiness({ userId: OWNER_ID, sessionToken: TOKEN, businessId: OUTSIDER_BIZ });
    expect(r).toEqual({ ok: false, reason: "not_member" });
    const s = await prisma.session.findUniqueOrThrow({ where: { sessionToken: TOKEN } });
    expect(s.activeBusinessId).toBe(BIZ_A); // inalterado
  });
});
