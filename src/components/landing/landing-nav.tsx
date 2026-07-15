import Link from "next/link";

import { getNavSession } from "@/server/auth/session";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import styles from "./landing.module.css";

// Nav da landing (issue #38, Peça 5). Server Component: a DECISÃO de exibir vem do SERVIDOR via
// getNavSession() — o MESMO mecanismo do SiteHeader global (003-nav-session), lido do banco por
// requisição. Não reimplementa papel nem confia em input do cliente; só o gatilho de Sair é ilha
// client (SignOutButton). Sem o SiteHeader na `/`, esta nav é a única fonte de consciência de sessão.
//
// Deslogado: Entrar (ghost) + "Agendar uma conversa" (pitch de venda).
// Logado: link contextual pelo papel + nome + Sair; o CTA de venda SOME (já é usuário, não lead).
export async function LandingNav({ whatsappHref }: { whatsappHref: string }) {
  const { user, isOwner } = await getNavSession();

  // Link contextual pelo papel (deriva do servidor, como o SiteHeader): dono → Painel; demais → a
  // própria agenda. Esconder é conveniência; a barreira real segue em requireOwner/requireUser.
  const contextual = isOwner
    ? { href: "/owner", label: "Painel" }
    : { href: "/my-bookings", label: "Meus agendamentos" };

  return (
    <nav className={styles.nav}>
      <div className={`${styles.wrap} ${styles.navIn}`}>
        <div className={styles.logo}>
          trimote<span className={styles.dot}>.</span>
        </div>
        <div className={styles.navLinks}>
          <a href="#como">Como funciona</a>
          {user ? (
            <>
              <Link href={contextual.href}>{contextual.label}</Link>
              {/* Indicação de sessão ativa (FR-007): o usuário sabe que autenticou e não clica em
                  Entrar de novo. */}
              <span className={styles.navUser}>{user.name ?? user.email}</span>
              <SignOutButton className={`${styles.btn} ${styles.btnSecundario}`} />
            </>
          ) : (
            <>
              {/* "Entrar" real (signIn google): sem o SiteHeader global na /, o login ficaria órfão
                  na home. Estilo secundário/ghost para não competir com o CTA primário. */}
              <SignInButton className={`${styles.btn} ${styles.btnSecundario}`} />
              <a href={whatsappHref} className={`${styles.btn} ${styles.btnPrimario}`}>
                Agendar uma conversa
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
