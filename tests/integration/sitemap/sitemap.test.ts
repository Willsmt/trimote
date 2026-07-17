import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import sitemap from "@/app/sitemap";
import { createTestBusiness, cleanupBusinesses } from "../multitenancy/fixtures";

// Integracao (issue #44): o sitemap so lista Business com isListed=true (opt-in explicito).
// Trava a regra de negocio central da flag: nenhum negocio entra no indice sem alguem decidir.
// /b/[slug] continua publico por link direto — isso NAO e testado aqui de proposito: a flag
// controla APENAS o sitemap.
const LISTED_ID = "biz-sitemap-listed";
const UNLISTED_ID = "biz-sitemap-unlisted";
const LISTED_SLUG = "sitemap-listado";
const UNLISTED_SLUG = "sitemap-nao-listado";

beforeAll(async () => {
  await createTestBusiness({ id: LISTED_ID, name: "Sitemap Listado", slug: LISTED_SLUG });
  await createTestBusiness({ id: UNLISTED_ID, name: "Sitemap Nao Listado", slug: UNLISTED_SLUG });
  // O fixture nao conhece isListed (default false); o opt-in e explicito aqui, como sera em prod.
  await prisma.business.update({ where: { id: LISTED_ID }, data: { isListed: true } });
});

afterAll(async () => {
  await cleanupBusinesses([LISTED_ID, UNLISTED_ID]);
  await prisma.$disconnect();
});

describe("sitemap — filtro isListed (issue #44)", () => {
  it("Business com isListed=true entra no sitemap", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`https://trimote.com.br/b/${LISTED_SLUG}`);
  });

  it("Business com isListed=false (default) NAO entra no sitemap", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).not.toContain(`https://trimote.com.br/b/${UNLISTED_SLUG}`);
  });

  it("rotas estaticas continuam presentes", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://trimote.com.br/");
    expect(urls).toContain("https://trimote.com.br/privacidade");
  });
});
