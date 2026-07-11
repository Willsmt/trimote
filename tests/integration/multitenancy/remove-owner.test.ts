import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { removeOwnerForAdmin } from "@/server/business/admin-remove-owner";
import {
  upsertUser,
  createTestBusiness,
  addMembership,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "./fixtures";

/**
 * Integração (Postgres) da REMOÇÃO de dono pelo ADMIN (issue #31). Espelha promoteOwnerForAdmin no
 * inverso: unlink puro do BusinessMember, guard de último-owner OBRIGATÓRIO e trava de concorrência
 * (advisory xact lock por businessId, padrão da #27) — dois removes simultâneos resultam em NO MÁXIMO
 * um delete e o negócio NUNCA fica sem dono.
 *
 * TEST-FIRST (RED por AUSÊNCIA da função/guard — o core é um stub que lança "not implemented"). O
 * módulo importa limpo (sem erro de import); os casos falham por comportamento até o GREEN.
 */

const ADMIN_ID = "u-rm-admin";
const OWNER_A = "u-rm-owner-a";
const OWNER_B = "u-rm-owner-b";
const OWNER_SOLO = "u-rm-owner-solo";
const USERS = [ADMIN_ID, OWNER_A, OWNER_B, OWNER_SOLO];

const BIZ_IDS: string[] = [];

/** Cria um negócio de teste e o registra para cleanup. */
async function newBusiness(id: string, slug: string): Promise<string> {
  await createTestBusiness({ id, name: `Neg ${slug}`, slug });
  BIZ_IDS.push(id);
  return id;
}

/** Vincula um dono e devolve o membershipId (o fixture faz upsert e não retorna o id). */
async function addOwner(userId: string, businessId: string): Promise<string> {
  await addMembership({ userId, businessId, createdBy: ADMIN_ID });
  const m = await prisma.businessMember.findFirstOrThrow({
    where: { userId, businessId },
    select: { id: true },
  });
  return m.id;
}

async function ownerCount(businessId: string): Promise<number> {
  return prisma.businessMember.count({ where: { businessId, role: "OWNER" } });
}

beforeAll(async () => {
  await upsertUser({ id: ADMIN_ID, email: "rm-admin@example.com", role: "ADMIN" });
  await upsertUser({ id: OWNER_A, email: "rm-owner-a@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_B, email: "rm-owner-b@example.com", role: "CLIENT" });
  await upsertUser({ id: OWNER_SOLO, email: "rm-owner-solo@example.com", role: "CLIENT" });
});

afterEach(async () => {
  await cleanupMembershipsAndSessions(USERS);
  if (BIZ_IDS.length) await cleanupBusinesses(BIZ_IDS.splice(0));
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: USERS } } });
  await prisma.$disconnect();
});

describe("removeOwnerForAdmin (issue #31)", () => {
  it("remove um dono quando há 2+ owners (linha deletada; negócio fica com 1)", async () => {
    const biz = await newBusiness("rm-biz-two", "rm-biz-two");
    const mA = await addOwner(OWNER_A, biz);
    await addOwner(OWNER_B, biz);

    const r = await removeOwnerForAdmin({ businessId: biz, membershipId: mA });

    expect(r).toEqual({ ok: true });
    expect(await prisma.businessMember.findUnique({ where: { id: mA } })).toBeNull();
    expect(await ownerCount(biz)).toBe(1);
  });

  it("recusa remover o ÚLTIMO owner (last_owner; linha intacta)", async () => {
    const biz = await newBusiness("rm-biz-solo", "rm-biz-solo");
    const mSolo = await addOwner(OWNER_SOLO, biz);

    const r = await removeOwnerForAdmin({ businessId: biz, membershipId: mSolo });

    expect(r).toEqual({ ok: false, reason: "last_owner" });
    expect(await prisma.businessMember.findUnique({ where: { id: mSolo } })).not.toBeNull();
    expect(await ownerCount(biz)).toBe(1);
  });

  it("concorrência: 2 removes simultâneos no mesmo negócio (2 owners) → exatamente 1 ok, nunca 0", async () => {
    const biz = await newBusiness("rm-biz-race", "rm-biz-race");
    const mA = await addOwner(OWNER_A, biz);
    const mB = await addOwner(OWNER_B, biz);

    const results = await Promise.all([
      removeOwnerForAdmin({ businessId: biz, membershipId: mA }),
      removeOwnerForAdmin({ businessId: biz, membershipId: mB }),
    ]);

    const oks = results.filter((r) => r.ok).length;
    expect(oks).toBe(1); // exatamente um delete; o outro recusa last_owner
    expect(await ownerCount(biz)).toBe(1); // negócio NUNCA fica sem dono
  });

  it("membership_not_found para membershipId inexistente e para vínculo de OUTRO negócio (sem oráculo)", async () => {
    const biz = await newBusiness("rm-biz-target", "rm-biz-target");
    await addOwner(OWNER_B, biz); // negócio-alvo válido e não fica órfão

    const inexistente = await removeOwnerForAdmin({ businessId: biz, membershipId: "nao-existe" });
    expect(inexistente).toEqual({ ok: false, reason: "membership_not_found" });

    // Vínculo que existe, mas em OUTRO negócio: não pode vazar que existe (cross-tenant).
    const other = await newBusiness("rm-biz-other", "rm-biz-other");
    const mOther = await addOwner(OWNER_A, other);
    const crossTenant = await removeOwnerForAdmin({ businessId: biz, membershipId: mOther });
    expect(crossTenant).toEqual({ ok: false, reason: "membership_not_found" });
    // e o vínculo do outro negócio segue intacto
    expect(await prisma.businessMember.findUnique({ where: { id: mOther } })).not.toBeNull();
  });

  it("business_not_found quando o negócio não existe", async () => {
    const r = await removeOwnerForAdmin({ businessId: "nao-existe", membershipId: "qualquer" });
    expect(r).toEqual({ ok: false, reason: "business_not_found" });
  });

  it("ADMIN remove a si como dono quando NÃO é o último (ok)", async () => {
    const biz = await newBusiness("rm-biz-self", "rm-biz-self");
    const mAdmin = await addOwner(ADMIN_ID, biz);
    await addOwner(OWNER_B, biz);

    const r = await removeOwnerForAdmin({ businessId: biz, membershipId: mAdmin });

    expect(r).toEqual({ ok: true });
    expect(await ownerCount(biz)).toBe(1);
  });
});
