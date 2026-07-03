/** @type {import('next').NextConfig} */

// Headers de seguranca aplicados a TODAS as rotas (issue #4). Next.js nao os seta por default.
// CSP e HSTS ficam de fora deste ciclo de proposito: CSP exige report-only + analise (Next injeta
// scripts inline) e vira follow-up; HSTS entra no checklist de deploy (dev local e http).
const securityHeaders = [
  // Anti-clickjacking: proibe a pagina de ser renderizada em frame/iframe.
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o browser de adivinhar (sniff) o content-type, mitigando MIME confusion.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nao vaza o path/query completo como referrer para origens externas.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
