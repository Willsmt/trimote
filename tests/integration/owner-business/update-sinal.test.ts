import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

// Mesmo padrão de update-whatsapp.test.ts: mocka getCurrentUser (sessão) e
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
import { updateBusinessSinal } from "@/server/actions/update-business-sinal";
import {
  createTestBusiness,
  addMembership,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "../multitenancy/fixtures";

// Sinal/chave PIX (Business.sinalPercentual + Business.chavePix): ação única — os dois campos são
// gravados juntos numa mesma chamada (decisão de produto: um sem o outro é inútil pro dono), mas
// SEM obrigatoriedade de os dois virem preenchidos juntos (null num deles é estado válido). Mesma
// disciplina anti-IDOR de update-business-whatsapp.ts: sem id de negócio no input, businessId vem de
// requireOwner().
const CLIENT_ID = "u-ubs-client";
const OWNER_ID = "u-ubs-owner";
const MULTI_OWNER_ID = "u-ubs-multi-owner";
const BIZ_SOLO = "biz-ubs-solo";
const BIZ_A = "biz-ubs-a";
const BIZ_B = "biz-ubs-b";

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUser({ id: CLIENT_ID, email: "ubs-client@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_ID, email: "ubs-owner@example.com", role: "OWNER" });
  await upsertUser({ id: MULTI_OWNER_ID, email: "ubs-multi@example.com", role: "OWNER" });

  await createTestBusiness({ id: BIZ_SOLO, name: "UBS Solo", slug: "ubs-solo" });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_SOLO, createdBy: OWNER_ID });

  await createTestBusiness({ id: BIZ_A, name: "UBS A", slug: "ubs-a" });
  await createTestBusiness({ id: BIZ_B, name: "UBS B", slug: "ubs-b" });
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

describe("updateBusinessSinal", () => {
  it("(a) CLIENT sem BusinessMember -> ForbiddenError (requireOwner, estado empty)", async () => {
    actAs(CLIENT_ID);
    await expect(
      updateBusinessSinal({ sinalPercentual: 50, chavePix: "chave@example.com" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("(b) OWNER com negócio único + percentual e chave válidos -> ok:true, persiste no negócio certo", async () => {
    actAs(OWNER_ID);
    const result = await updateBusinessSinal({ sinalPercentual: 30, chavePix: "chave@example.com" });
    expect(result).toEqual({ ok: true, sinalPercentual: 30, chavePix: "chave@example.com" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.sinalPercentual).toBe(30);
    expect(business.chavePix).toBe("chave@example.com");
  });

  it("(c) dono com dois negócios (A ativo) -> só A muda, B permanece null", async () => {
    actAs(MULTI_OWNER_ID);
    hintState.value = BIZ_A;

    const result = await updateBusinessSinal({ sinalPercentual: 20, chavePix: "11999999999" });
    expect(result).toEqual({ ok: true, sinalPercentual: 20, chavePix: "11999999999" });

    const bizA = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_A } });
    const bizB = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } });
    expect(bizA.sinalPercentual).toBe(20);
    expect(bizA.chavePix).toBe("11999999999");
    expect(bizB.sinalPercentual).toBeNull();
    expect(bizB.chavePix).toBeNull();
  });

  it("(d) percentual acima de 100 -> ok:false invalid_percentual, banco não muda", async () => {
    await prisma.business.update({
      where: { id: BIZ_SOLO },
      data: { sinalPercentual: 30, chavePix: "chave@example.com" },
    });

    actAs(OWNER_ID);
    const result = await updateBusinessSinal({ sinalPercentual: 150, chavePix: "outra-chave" });
    expect(result).toEqual({ ok: false, reason: "invalid_percentual" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.sinalPercentual).toBe(30);
    expect(business.chavePix).toBe("chave@example.com");
  });

  it("(e) percentual negativo -> ok:false invalid_percentual, banco não muda", async () => {
    await prisma.business.update({
      where: { id: BIZ_SOLO },
      data: { sinalPercentual: 30, chavePix: "chave@example.com" },
    });

    actAs(OWNER_ID);
    const result = await updateBusinessSinal({ sinalPercentual: -5, chavePix: "outra-chave" });
    expect(result).toEqual({ ok: false, reason: "invalid_percentual" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.sinalPercentual).toBe(30);
    expect(business.chavePix).toBe("chave@example.com");
  });

  it("(f) percentual não-inteiro -> ok:false invalid_percentual, banco não muda", async () => {
    await prisma.business.update({
      where: { id: BIZ_SOLO },
      data: { sinalPercentual: 30, chavePix: "chave@example.com" },
    });

    actAs(OWNER_ID);
    const result = await updateBusinessSinal({ sinalPercentual: 33.5, chavePix: "outra-chave" });
    expect(result).toEqual({ ok: false, reason: "invalid_percentual" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.sinalPercentual).toBe(30);
    expect(business.chavePix).toBe("chave@example.com");
  });

  it("(g) percentual null desliga o sinal -> ok:true, campo vira null", async () => {
    await prisma.business.update({
      where: { id: BIZ_SOLO },
      data: { sinalPercentual: 30, chavePix: "chave@example.com" },
    });

    actAs(OWNER_ID);
    const result = await updateBusinessSinal({ sinalPercentual: null, chavePix: "chave@example.com" });
    expect(result).toEqual({ ok: true, sinalPercentual: null, chavePix: "chave@example.com" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.sinalPercentual).toBeNull();
  });

  it("(h) chavePix vazio -> ok:true, campo vira null", async () => {
    await prisma.business.update({
      where: { id: BIZ_SOLO },
      data: { sinalPercentual: 30, chavePix: "chave@example.com" },
    });

    actAs(OWNER_ID);
    const result = await updateBusinessSinal({ sinalPercentual: 30, chavePix: "" });
    expect(result).toEqual({ ok: true, sinalPercentual: 30, chavePix: null });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_SOLO } });
    expect(business.chavePix).toBeNull();
  });
});
