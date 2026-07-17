import type { MetadataRoute } from "next";

import { prisma } from "@/server/db/client";

// sitemap.xml (App Router, issue #40). URLs devem ser ABSOLUTAS (o metadataBase nao se aplica ao
// sitemap). Base fixa, igual ao metadataBase do layout raiz.
const BASE = "https://trimote.com.br";

// ISR diario: cada negocio publico novo entra no sitemap sem rebuild. Uma query por revalidacao
// (findMany de slugs) — custo desprezivel no MVP (poucos negocios).
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // So entra quem fez opt-in (isListed, issue #44) — nenhum negocio e indexado sem alguem decidir.
  // A porta publica /b/[slug] continua acessivel por link direto (funil QR/Instagram); a flag
  // controla APENAS o sitemap. Sem updatedAt no model, uso createdAt como lastModified.
  const businesses = await prisma.business.findMany({
    where: { isListed: true },
    select: { slug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const negocios: MetadataRoute.Sitemap = businesses.map((b) => ({
    url: `${BASE}/b/${b.slug}`,
    lastModified: b.createdAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    { url: `${BASE}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/privacidade`, changeFrequency: "yearly", priority: 0.3 },
    ...negocios,
  ];
}
