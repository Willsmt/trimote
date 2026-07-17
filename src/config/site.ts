// Fonte UNICA da URL canonica do site (issue #44, divida #2). Constante, nao env var:
// disponivel em build time (metadataBase/robots/sitemap avaliam no build) sem acoplar o build
// a presenca de mais uma variavel. Preview da Vercel emite a URL de producao de proposito —
// canonical/sitemap devem sempre apontar para o dominio real. Sem barra final.
export const SITE_URL = "https://trimote.com.br";
