import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Layout do app existente (grupo (site) — não entra na URL). Reúne o header e o rodapé globais que
// antes moravam no layout raiz, mais o esqueleto de sticky footer (coluna flex de altura mínima do
// viewport: o conteúdo cresce com flex-1 e empurra o rodapé para a base em páginas curtas).
//
// Vale para TODAS as rotas do app (/owner, /b/[slug], /my-bookings, /privacidade, ...). A landing
// (grupo (marketing)) fica de fora e traz sua própria navegação.
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
