// Layout do grupo (public) — página pública do negócio (/b/[slug]), fora do grupo (site). O
// SiteHeader/SiteFooter do app mostram a marca Trimote, que vende para o DONO da barbearia; o
// cliente final que agenda pelo link/QR não deveria ver esse cromo (issue #49). Sem nav, sem
// tema/fonte de marca do app (isso fica pra #46) — tema claro e Fraunces próprios (issue #50,
// specs/landing/CONSTITUICAO-VISUAL.md), e a âncora LGPD, que precisa continuar acessível em
// qualquer página pública (privacidade).
import Link from "next/link";

import { fraunces } from "../fonts";
import styles from "./public-page.module.css";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fraunces.variable} flex min-h-screen flex-col`}>
      <div className="flex-1">{children}</div>
      <footer className={`${styles.selo} mx-auto w-full max-w-xl px-8`}>
        <span className={styles.marca}>
          agendamento por <span className={styles.wm}>trimote</span>
          <span className={styles.dot}>.</span>
        </span>
        <Link href="/privacidade">Política de Privacidade</Link>
      </footer>
    </div>
  );
}
