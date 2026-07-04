import { describe, it, expect, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { DEMO_BUSINESS_ID } from "./fixtures";
import { SLUG_PATTERN, isReservedSlug } from "@/server/business/reserved-slugs";

// Verificação PÓS-MIGRAÇÃO do backfill (007, US6 — não é RED-first; valida o resultado da migration 2
// + seed). Garante que o showroom permanece com sua fundação multi-tenant. (FR-024/SC-005)

afterAll(async () => {
  await prisma.$disconnect();
});

describe("backfill da instalação existente (US6)", () => {
  it("o negócio showroom permanece, com slug válido, não reservado, e segment barbershop", async () => {
    const demo = await prisma.business.findUniqueOrThrow({ where: { id: DEMO_BUSINESS_ID } });
    expect(demo.slug).toBeTruthy();
    expect(SLUG_PATTERN.test(demo.slug)).toBe(true);
    expect(isReservedSlug(demo.slug)).toBe(false);
    expect(demo.segment).toBe("barbershop");
  });

  it("os serviços do showroom seguem vinculados a ele (nada re-associado)", async () => {
    // Os serviços do seed pertencem ao showroom (a FK garante que apontam para um Business existente;
    // aqui confirmamos que continuam neste negócio apos o rename+backfill).
    const services = await prisma.service.count({ where: { businessId: DEMO_BUSINESS_ID } });
    expect(services).toBeGreaterThan(0);
  });

  it("o showroom tem ao menos um dono (BusinessMember OWNER) e existe um ADMIN de plataforma", async () => {
    const owners = await prisma.businessMember.count({
      where: { businessId: DEMO_BUSINESS_ID, role: "OWNER" },
    });
    expect(owners).toBeGreaterThan(0);

    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    expect(admins).toBeGreaterThan(0);
  });
});
