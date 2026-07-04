import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

// Mock de sessão (padrão F005) — afeta os guards; os cores rodam com adminId explícito.
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
import { requireAdmin } from "@/server/auth/admin";
import { createBusinessForAdmin } from "@/server/business/admin-create-business";
import { promoteOwnerForAdmin } from "@/server/business/admin-promote-owner";
import { upsertUser, cleanupBusinesses, cleanupMembershipsAndSessions } from "./fixtures";

// Integração (Postgres) da administração (US1): guard requireAdmin, criação de negócio e promoção de
// dono, auditáveis. (SC-003, FR-004..009)
const ADMIN_ID = "u-mt-admin";
const CLIENT_ID = "u-mt-client";
const OWNER_ID = "u-mt-owner";
const CANDIDATE_ID = "u-mt-candidate";
const BIZ_IDS: string[] = [];

function actAs(id: string | null) {
  mockState.userId = id;
}

beforeAll(async () => {
  await upsertUser({ id: ADMIN_ID, email: "mt-admin@example.com", role: "ADMIN" });
  await upsertUser({ id: CLIENT_ID, email: "mt-client@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_ID, email: "mt-owner@example.com", role: "CLIENT" });
  await upsertUser({ id: CANDIDATE_ID, email: "mt-candidate@example.com", role: "CLIENT" });
});

afterEach(async () => {
  actAs(null);
  await cleanupMembershipsAndSessions([ADMIN_ID, CLIENT_ID, OWNER_ID, CANDIDATE_ID]);
  if (BIZ_IDS.length) await cleanupBusinesses(BIZ_IDS.splice(0));
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, CLIENT_ID, OWNER_ID, CANDIDATE_ID] } } });
  await prisma.$disconnect();
});

async function newBusiness(slug: string) {
  const r = await createBusinessForAdmin({ adminId: ADMIN_ID, name: `Neg ${slug}`, slug, timeZone: "America/Sao_Paulo" });
  if (r.ok) BIZ_IDS.push(r.businessId);
  return r;
}

describe("requireAdmin (guard de plataforma)", () => {
  it("nega CLIENT e OWNER-membro; admite ADMIN", async () => {
    actAs(CLIENT_ID);
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
    actAs(OWNER_ID);
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
    actAs(ADMIN_ID);
    await expect(requireAdmin()).resolves.toMatchObject({ id: ADMIN_ID });
  });
});

describe("createBusinessForAdmin", () => {
  it("cria o negócio com slug, autor e momento (auditoria)", async () => {
    const r = await newBusiness("alpha-shop");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const biz = await prisma.business.findUniqueOrThrow({ where: { id: r.businessId } });
    expect(biz.slug).toBe("alpha-shop");
    expect(biz.createdBy).toBe(ADMIN_ID);
    expect(biz.segment).toBe("barbershop");
  });
});

describe("promoteOwnerForAdmin", () => {
  it("vincula um usuário existente (por email exato) como OWNER, auditado", async () => {
    const b = await newBusiness("beta-shop");
    if (!b.ok) throw new Error("setup");
    const r = await promoteOwnerForAdmin({ adminId: ADMIN_ID, businessId: b.businessId, email: "mt-candidate@example.com" });
    expect(r.ok).toBe(true);
    const m = await prisma.businessMember.findFirstOrThrow({ where: { userId: CANDIDATE_ID, businessId: b.businessId } });
    expect(m.role).toBe("OWNER");
    expect(m.createdBy).toBe(ADMIN_ID);
  });

  it("recusa email sem usuário (user_not_found) e vínculo duplicado (already_member)", async () => {
    const b = await newBusiness("gama-shop");
    if (!b.ok) throw new Error("setup");
    const missing = await promoteOwnerForAdmin({ adminId: ADMIN_ID, businessId: b.businessId, email: "ninguem@example.com" });
    expect(missing).toEqual({ ok: false, reason: "user_not_found" });

    await promoteOwnerForAdmin({ adminId: ADMIN_ID, businessId: b.businessId, email: "mt-candidate@example.com" });
    const dup = await promoteOwnerForAdmin({ adminId: ADMIN_ID, businessId: b.businessId, email: "mt-candidate@example.com" });
    expect(dup).toEqual({ ok: false, reason: "already_member" });
  });

  it("promover a OWNER NÃO altera o Role global do usuário (sem escalada vertical)", async () => {
    const b = await newBusiness("delta-shop");
    if (!b.ok) throw new Error("setup");
    await promoteOwnerForAdmin({ adminId: ADMIN_ID, businessId: b.businessId, email: "mt-candidate@example.com" });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: CANDIDATE_ID } });
    expect(u.role).toBe("CLIENT"); // continua CLIENT de plataforma; posse vive no vínculo
  });
});
