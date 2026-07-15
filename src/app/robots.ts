import type { MetadataRoute } from "next";

// robots.txt (App Router, issue #40). Indexavel: / , /privacidade e as paginas publicas de negocio
// /b/[slug]. Bloqueado: tudo que e area logada ou nao-conteudo. Disallow casa por PREFIXO, entao
// "/owner" cobre /owner e /owner/**, "/my-bookings" cobre /my-bookings/**. Esconder do crawler e
// higiene de SEO — a barreira real continua em requireUser/requireOwner/requireAdmin no servidor.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/owner", "/admin", "/profile", "/my-bookings", "/my-spending", "/booking", "/api/"],
    },
    sitemap: "https://trimote.com.br/sitemap.xml",
  };
}
