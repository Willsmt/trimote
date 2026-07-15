"use client";

import { signIn, signOut } from "next-auth/react";

/**
 * Ilha client mínima da navegação (003-nav-session): apenas os gatilhos de sessão.
 *
 * `signIn`/`signOut` são funções client-side do NextAuth. Isolá-las aqui mantém toda a DECISÃO de
 * quais links exibir no servidor (src/components/site-header.tsx); estes botões só disparam a ação.
 */

/**
 * Ação "Entrar" (FR-001): inicia o login com Google a partir da navegação, sem digitar URL.
 *
 * `className` opcional permite reestilizar sem duplicar a ação `signIn`: o site-header (tema claro
 * do app) omite e recebe o estilo padrão; a landing (tema escuro, grupo (marketing)) passa suas
 * classes do CSS Module. A DECISÃO de exibir continua no servidor; aqui só dispara o login.
 */
export function SignInButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn("google")}
      className={className ?? "rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"}
    >
      Entrar
    </button>
  );
}

/** Ação "Sair" (FR-002): encerra a sessão e volta à condição de visitante. */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
    >
      Sair
    </button>
  );
}
