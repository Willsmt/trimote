import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { createBusinessForAdmin } from "@/server/business/admin-create-business";
import { RESERVED_SLUGS } from "@/server/business/reserved-slugs";
import { upsertUser, cleanupBusinesses } from "./fixtures";

// Integração (Postgres) da validação de slug (US1, SC-007/FR-023): formato, unicidade e reservados,
// via createBusinessForAdmin. A lista canônica vem de RESERVED_SLUGS (fonte única).
const ADMIN_ID = "u-slug-admin";
const BIZ_IDS: string[] = [];

beforeAll(async () => {
  await upsertUser({ id: ADMIN_ID, email: "slug-admin@example.com", role: "ADMIN" });
});

afterEach(async () => {
  if (BIZ_IDS.length) await cleanupBusinesses(BIZ_IDS.splice(0));
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: ADMIN_ID } });
  await prisma.$disconnect();
});

async function create(slug: string) {
  const r = await createBusinessForAdmin({ adminId: ADMIN_ID, name: "X", slug, timeZone: "America/Sao_Paulo" });
  if (r.ok) BIZ_IDS.push(r.businessId);
  return r;
}

describe("validação de slug (US1)", () => {
  it("formato inválido → invalid_slug", async () => {
    for (const bad of ["Alpha", "com espaco", "acento-ç", "-inicio", "fim-", "dois--hifens", ""]) {
      expect(await create(bad)).toEqual({ ok: false, reason: "invalid_slug" });
    }
  });

  it("slug reservado → slug_reserved (toda a lista RESERVED_SLUGS)", async () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(await create(reserved)).toEqual({ ok: false, reason: "slug_reserved" });
    }
  });

  it("slug duplicado → slug_taken", async () => {
    const first = await create("unico-slug");
    expect(first.ok).toBe(true);
    expect(await create("unico-slug")).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("slug válido e livre → criado", async () => {
    const r = await create("barbearia-do-ze");
    expect(r.ok).toBe(true);
  });
});
