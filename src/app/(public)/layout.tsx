// Layout do grupo (public) — página pública do negócio (/b/[slug]), fora do grupo (site). O
// SiteHeader/SiteFooter do app mostram a marca Trimote, que vende para o DONO da barbearia; o
// cliente final que agenda pelo link/QR não deveria ver esse cromo (issue #49). Sem nav, sem
// tema/fonte de marca (isso fica pra #46) — só o essencial: selo textual do serviço e a âncora
// LGPD, que precisa continuar acessível em qualquer página pública (privacidade).
import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="p-4 text-sm text-neutral-500">agendamento por trimote.</div>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-neutral-200 p-4 text-sm text-neutral-500">
        <Link href="/privacidade" className="hover:underline">
          Política de Privacidade
        </Link>
      </footer>
    </div>
  );
}
