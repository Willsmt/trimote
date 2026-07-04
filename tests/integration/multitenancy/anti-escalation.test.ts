import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

const mockState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

import { prisma } from "@/server/db/client";
import { ForbiddenError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { createBusiness } from "@/server/actions/admin-create-business";
import { promoteOwner } from "@/server/actions/admin-promote-owner";
import * as adminCreateActions from "@/server/actions/admin-create-business";
import * as adminPromoteActions from "@/server/actions/admin-promote-owner";
import { upsertUser, cleanupBusinesses, cleanupMembershipsAndSessions } from "./fixtures";

// Integração: anti-escalação de privilégio (US1/US3, SC-003/SC-004). Nenhum caminho publico eleva
// privilegio; ADMIN so promove a OWNER; nao existe action de promover a ADMIN.
const ADMIN_ID = "u-esc-admin";
const CLIENT_ID = "u-esc-client";
const CANDIDATE_ID = "u-esc-candidate";
const BIZ_IDS: string[] = [];

function actAs(id: string | null) {
  mockState.userId = id;
}

beforeAll(async () => {
  await upsertUser({ id: ADMIN_ID, email: "esc-admin@example.com", role: "ADMIN" });
  await upsertUser({ id: CLIENT_ID, email: "esc-client@example.com", role: "CLIENT" });
  await upsertUser({ id: CANDIDATE_ID, email: "esc-candidate@example.com", role: "CLIENT" });
});

afterEach(async () => {
  actAs(null);
  await cleanupMembershipsAndSessions([ADMIN_ID, CLIENT_ID, CANDIDATE_ID]);
  if (BIZ_IDS.length) await cleanupBusinesses(BIZ_IDS.splice(0));
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, CLIENT_ID, CANDIDATE_ID] } } });
  await prisma.$disconnect();
});

describe("anti-escalação de privilégio (US1/US3)", () => {
  it("CLIENT chamando actions de admin → ForbiddenError; visitante → UnauthorizedError", async () => {
    actAs(CLIENT_ID);
    await expect(createBusiness({ name: "X", slug: "x-shop", timeZone: "America/Sao_Paulo" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(promoteOwner({ businessId: "b", email: "e@e.com" })).rejects.toBeInstanceOf(ForbiddenError);
    actAs(null);
    await expect(createBusiness({ name: "X", slug: "y-shop", timeZone: "America/Sao_Paulo" })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("ADMIN cria negócio e promove — mas a promoção NÃO existe para ADMIN (só OWNER)", async () => {
    actAs(ADMIN_ID);
    const created = await createBusiness({ name: "X", slug: "z-shop", timeZone: "America/Sao_Paulo" });
    expect(created.ok).toBe(true);
    if (created.ok) BIZ_IDS.push(created.businessId);

    // Não existe símbolo/action para promover a ADMIN nem para escrever User.role.
    const createNames = Object.keys(adminCreateActions);
    const promoteNames = Object.keys(adminPromoteActions);
    for (const n of [...createNames, ...promoteNames]) {
      expect(n.toLowerCase()).not.toContain("admin"); // nenhuma action "promoteToAdmin"/"makeAdmin"
    }

    // promoteOwner cria vínculo OWNER e NÃO toca User.role do promovido.
    if (created.ok) {
      await promoteOwner({ businessId: created.businessId, email: "esc-candidate@example.com" });
      const u = await prisma.user.findUniqueOrThrow({ where: { id: CANDIDATE_ID } });
      expect(u.role).toBe("CLIENT");
      const m = await prisma.businessMember.findFirstOrThrow({ where: { userId: CANDIDATE_ID, businessId: created.businessId } });
      expect(m.role).toBe("OWNER");
    }
  });
});
