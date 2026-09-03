import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

// Mesmo padrão de owner-layout-switcher.test.ts: mocka getCurrentUser (sessão) e
// readActiveBusinessHint (fora de request, cookies() lançaria) — resolveActiveBusiness continua
// REAL, batendo no banco pela membership de verdade.
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
import { updateBusinessWhatsapp } from "@/server/actions/update-business-whatsapp";
import {
  createTestBusiness,
  addMembership,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "../multitenancy/fixtures";

// Primeira mutação em Business via código (issue #52). Sem id de negócio no input — requireOwner()
// resolve o businessId pela sessão, então o IDOR cross-tenant clássico (id de outro tenant no input)
// não se aplica: não há id pra um atacante passar. O risco real é outro — escrever no negócio ERRADO
// quando o dono tem mais de um vínculo (caso c).
const CLIENT_ID = "u-obw-client";
const OWNER_ID = "u-obw-owner";
const MULTI_OWNER_ID = "u-obw-multi-owner";
const BIZ_SOLO = "biz-obw-solo";
const BIZ_A = "biz-obw-a";
const BIZ_B = "biz-obw-b";

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUser({ id: CLIENT_ID, email: "obw-client@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_ID, email: "obw-owner@example.com", role: "OWNER" });
  await upsertUser({ id: MULTI_OWNER_ID, email: "obw-multi@example.com", role: "OWNER" });

  await createTestBusiness({ id: BIZ_SOLO, name: "OBW Solo", slug: "obw-solo" });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_SOLO, createdBy: OWNER_ID });

  await createTestBusiness({ id: BIZ_A, name: "OBW A", slug: "obw-a" });
  await createTestBusiness({ id: BIZ_B, name: "OBW B", slug: "obw-b" });
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

describe("updateBusinessWhatsapp (#52)", () => {
  it("(a) CLIENT sem BusinessMember -> ForbiddenError (requireOwner, estado empty)", async () => {
    actAs(CLIENT_ID);
    await expect(updateBusinessWhatsapp({ whatsapp: "(11) 99999-9999" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("(b) OWNER com negócio único + celular válido -> ok:true, persiste no negócio certo", async () => {
    actAs(OWNER_ID);
    const result = await updateBusinessWhatsapp({ whatsapp: "(11) 99999-9999" });
    expect(result).toEqual({ ok: true, whatsapp: "+5511999999999" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.whatsapp).toBe("+5511999999999");
  });

  it("(c) dono com dois negócios (A ativo) -> só A muda, B permanece null", async () => {
    actAs(MULTI_OWNER_ID);
    hintState.value = BIZ_A;

    const result = await updateBusinessWhatsapp({ whatsapp: "(21) 98888-8888" });
    expect(result).toEqual({ ok: true, whatsapp: "+5521988888888" });

    const bizA = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_A } });
    const bizB = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } });
    expect(bizA.whatsapp).toBe("+5521988888888");
    expect(bizB.whatsapp).toBeNull();
  });

  it("(d) número inválido -> ok:false invalid_phone, banco não muda", async () => {
    // Estado inicial conhecido e não-nulo, pra provar que a rejeição não sobrescreve nem limpa.
    await prisma.business.update({ where: { id: BIZ_SOLO }, data: { whatsapp: "+5511999999999" } });

    actAs(OWNER_ID);
    const result = await updateBusinessWhatsapp({ whatsapp: "telefone-invalido" });
    expect(result).toEqual({ ok: false, reason: "invalid_phone" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.whatsapp).toBe("+5511999999999");
  });

  it("(e) submissão vazia/null -> whatsapp volta a null", async () => {
    await prisma.business.update({ where: { id: BIZ_SOLO }, data: { whatsapp: "+5511999999999" } });

    actAs(OWNER_ID);
    const result = await updateBusinessWhatsapp({ whatsapp: null });
    expect(result).toEqual({ ok: true, whatsapp: null });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.whatsapp).toBeNull();
  });
});
