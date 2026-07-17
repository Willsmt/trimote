import type { Metadata } from "next";
import "./globals.css";

import { inter } from "./fonts";
import { CookieNotice } from "@/components/cookie-notice";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = {
  // metadataBase no root: resolve as URLs relativas de OG/canonical de TODAS as rotas (canonical da
  // landing, og:image da Peca 3). Definido uma vez aqui, herdado por (site) e (marketing).
  metadataBase: new URL(SITE_URL),
  // Titulo padrao do app; a landing e cada pagina publica (ex.: /privacidade) sobrescrevem. A
  // description generica de barbearia saiu (multi-tenant): as paginas que precisam definem a sua; as
  // privadas (owner/admin/perfil) nao dependem de SEO.
  title: "Trimote",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layout raiz enxuto: só o documento (<html>/<body>), a fonte base (Inter, self-hosted) e o aviso
  // de cookies global (LGPD). O header/rodapé do app saíram daqui para o grupo (site) — assim a
  // landing (grupo (marketing)) pode ter nav/tema próprios sem herdar o cabeçalho claro do app.
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className={inter.className}>
        {children}
        {/* Faixa informativa de cookies (036): global, dispensável, `fixed` — não depende de wrapper. */}
        <CookieNotice />
      </body>
    </html>
  );
}
