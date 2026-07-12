import type { Metadata } from "next";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CookieNotice } from "@/components/cookie-notice";

export const metadata: Metadata = {
  title: "Trimote",
  description: "Agendamento online de barbearia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Header montado uma única vez no layout raiz para aparecer em todas as páginas (FR-008).
  return (
    <html lang="pt-BR">
      {/* Coluna flex de altura mínima do viewport: o conteúdo cresce (flex-1) e empurra o rodapé
          para a base mesmo em páginas curtas (sticky footer), em vez de ele flutuar no meio. */}
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        {/* Rodapé global (036): acesso permanente à Política, no fluxo do documento. */}
        <SiteFooter />
        {/* Faixa informativa de cookies (036): global, dispensável, não bloqueia o uso. */}
        <CookieNotice />
      </body>
    </html>
  );
}
