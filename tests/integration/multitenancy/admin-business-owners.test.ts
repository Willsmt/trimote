import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { listBusinessesForAdmin } from "@/server/business/list-businesses-for-admin";
import { createTestBusiness, addMembership, cleanupBusinesses, cleanupMembershipsAndSessions } from "./fixtures";

// Integracao (issue #14): a listagem de negocios do ADMIN traz os DONOS (nome + email). Trava o
// filtro role:"OWNER" e o escopo por negocio contra regressao futura.
const BIZ_A = "biz-adm-owners-a";
const BIZ_B = "biz-adm-owners-b";
const OWNER_A = "u-adm-owner-a";
const OWNER_B = "u-adm-owner-b";
const NON_MEMBER = "u-adm-nonmember";

beforeAll(async () => {
  // Donos com nome + email (o fixture upsertUser nao seta name; aqui precisamos do name).
  await prisma.user.upsert({
    where: { id: OWNER_A },
    update: { name: "Dono A", email: "dono-a@example.com", role: "OWNER" },
    create: { id: OWNER_A, name: "Dono A", email: "dono-a@example.com", role: "OWNER" },
  });
  await prisma.user.upsert({
    where: { id: OWNER_B },
    update: { name: "Dono B", email: "dono-b@example.com", role: "OWNER" },
    create: { id: OWNER_B, name: "Dono B", email: "dono-b@example.com", role: "OWNER" },
  });
  await prisma.user.upsert({
    where: { id: NON_MEMBER },
    update: { email: "nonmember@example.com", role: "CLIENT" },
    create: { id: NON_MEMBER, email: "nonmember@example.com", role: "CLIENT" },
  });
  await createTestBusiness({ id: BIZ_A, name: "Adm Owners A", slug: "adm-owners-a" });
  await createTestBusiness({ id: BIZ_B, name: "Adm Owners B", slug: "adm-owners-b" });
  await addMembership({ userId: OWNER_A, businessId: BIZ_A, createdBy: OWNER_A });
  await addMembership({ userId: OWNER_B, businessId: BIZ_B, createdBy: OWNER_B });
});

afterAll(async () => {
  await cleanupMembershipsAndSessions([OWNER_A, OWNER_B, NON_MEMBER]);
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B, NON_MEMBER] } } });
  await prisma.$disconnect();
});

describe("listagem de negocios do admin — donos (issue #14)", () => {
  it("negocio com owner aparece com nome + email", async () => {
    const all = await listBusinessesForAdmin();
    const a = all.find((b) => b.id === BIZ_A);
    expect(a).toBeDefined();
    expect(a!.owners).toEqual([{ name: "Dono A", email: "dono-a@example.com" }]);
  });

  it("so o OWNER do proprio negocio aparece; dono de B nao vaza para A; nao-membro nao aparece", async () => {
    const all = await listBusinessesForAdmin();
    const a = all.find((b) => b.id === BIZ_A)!;
    const b = all.find((b) => b.id === BIZ_B)!;

    // Sem vazamento cross-business: A so o dono de A; B so o de B.
    expect(a.owners.map((o) => o.email)).toEqual(["dono-a@example.com"]);
    expect(b.owners.map((o) => o.email)).toEqual(["dono-b@example.com"]);

    // Usuario sem membership nunca aparece como dono de nenhum negocio.
    const allOwnerEmails = all.flatMap((biz) => biz.owners.map((o) => o.email));
    expect(allOwnerEmails).not.toContain("nonmember@example.com");

    // NOTA: BusinessRole so tem OWNER hoje, entao nao da para semear um membro nao-OWNER (o enum do
    // banco recusa). O filtro where role:"OWNER" ja esta no core; quando um STAFF for adicionado ao
    // enum, incluir aqui um membro STAFF em A e assertar que NAO entra em a.owners.
  });
});
