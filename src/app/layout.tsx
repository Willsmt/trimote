import type { Metadata } from "next";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";
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
      <body>
        <SiteHeader />
        {children}
        {/* Faixa informativa de cookies (036): global, dispensável, não bloqueia o uso. */}
        <CookieNotice />
      </body>
    </html>
  );
}
