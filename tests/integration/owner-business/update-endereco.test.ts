import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

// Mesmo padrão de update-whatsapp.test.ts / owner-layout-switcher.test.ts: mocka getCurrentUser
// (sessão) e readActiveBusinessHint (fora de request, cookies() lançaria) — resolveActiveBusiness
// continua REAL, batendo no banco pela membership de verdade.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));
const hintState = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

vi.mock("@/server/business/active-business", async (importActual) => {
  const actual = await importActual<typeof import("@/server/business/active-business")>();
  return {
    ...actual,
    readActiveBusinessHint: async () => hintState.value,
  };
});

import { prisma } from "@/server/db/client";
import { ForbiddenError } from "@/server/auth/owner";
import { updateBusinessEndereco } from "@/server/actions/update-business-endereco";
import {
  createTestBusiness,
  addMembership,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "../multitenancy/fixtures";

// Segundo campo de Business via código (issue #54), mesmo padrão anti-IDOR do whatsapp (#52): sem
// businessId no input — requireOwner() resolve pela sessão. O risco real não é IDOR clássico, e sim
// escrever no negócio ERRADO quando o dono tem mais de um vínculo (caso c).
const CLIENT_ID = "u-obe-client";
const OWNER_ID = "u-obe-owner";
const MULTI_OWNER_ID = "u-obe-multi-owner";
const BIZ_SOLO = "biz-obe-solo";
const BIZ_A = "biz-obe-a";
const BIZ_B = "biz-obe-b";

const ENDERECO_VALIDO = "Rua Aurora, 210 — Vila Romana, São Paulo";

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUser({ id: CLIENT_ID, email: "obe-client@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_ID, email: "obe-owner@example.com", role: "OWNER" });
  await upsertUser({ id: MULTI_OWNER_ID, email: "obe-multi@example.com", role: "OWNER" });

  await createTestBusiness({ id: BIZ_SOLO, name: "OBE Solo", slug: "obe-solo" });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_SOLO, createdBy: OWNER_ID });

  await createTestBusiness({ id: BIZ_A, name: "OBE A", slug: "obe-a" });
  await createTestBusiness({ id: BIZ_B, name: "OBE B", slug: "obe-b" });
  await addMembership({ userId: MULTI_OWNER_ID, businessId: BIZ_A, createdBy: MULTI_OWNER_ID });
  await addMembership({ userId: MULTI_OWNER_ID, businessId: BIZ_B, createdBy: MULTI_OWNER_ID });
});

afterEach(async () => {
  actAs(null);
  hintState.value = null;
});

afterAll(async () => {
  await cleanupBusinesses([BIZ_SOLO, BIZ_A, BIZ_B]);
  await cleanupMembershipsAndSessions([CLIENT_ID, OWNER_ID, MULTI_OWNER_ID]);
  await prisma.user.deleteMany({ where: { id: { in: [CLIENT_ID, OWNER_ID, MULTI_OWNER_ID] } } });
  await prisma.$disconnect();
});

describe("updateBusinessEndereco (#54)", () => {
  it("(a) CLIENT sem BusinessMember -> ForbiddenError (requireOwner, estado empty)", async () => {
    actAs(CLIENT_ID);
    await expect(updateBusinessEndereco({ endereco: ENDERECO_VALIDO })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("(b) OWNER com negócio único + endereço válido -> ok:true, persiste no negócio certo", async () => {
    actAs(OWNER_ID);
    const result = await updateBusinessEndereco({ endereco: ENDERECO_VALIDO });
    expect(result).toEqual({ ok: true, endereco: ENDERECO_VALIDO });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.endereco).toBe(ENDERECO_VALIDO);
  });

  it("(c) dono com dois negócios (A ativo) -> só A muda, B permanece null", async () => {
    actAs(MULTI_OWNER_ID);
    hintState.value = BIZ_A;

    const result = await updateBusinessEndereco({ endereco: "Av. Paulista, 1000 — São Paulo" });
    expect(result).toEqual({ ok: true, endereco: "Av. Paulista, 1000 — São Paulo" });

    const bizA = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_A } });
    const bizB = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } });
    expect(bizA.endereco).toBe("Av. Paulista, 1000 — São Paulo");
    expect(bizB.endereco).toBeNull();
  });

  it("(d) string vazia ou só espaços -> ok:false invalid_input, banco não muda", async () => {
    // Estado inicial conhecido e não-nulo, pra provar que a rejeição não sobrescreve nem limpa.
    await prisma.business.update({ where: { id: BIZ_SOLO }, data: { endereco: ENDERECO_VALIDO } });

    actAs(OWNER_ID);
    const result = await updateBusinessEndereco({ endereco: "   " });
    expect(result).toEqual({ ok: false, reason: "invalid_input" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.endereco).toBe(ENDERECO_VALIDO);
  });

  it("(e) submissão vazia/null -> endereco volta a null", async () => {
    await prisma.business.update({ where: { id: BIZ_SOLO }, data: { endereco: ENDERECO_VALIDO } });

    actAs(OWNER_ID);
    const result = await updateBusinessEndereco({ endereco: null });
    expect(result).toEqual({ ok: true, endereco: null });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.endereco).toBeNull();
  });
});
