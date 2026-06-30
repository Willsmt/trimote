import Link from "next/link";

import { getNavSession } from "@/server/auth/session";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";

/**
 * Navegação global (003-nav-session, FR-008). Server Component: a DECISÃO de quais links exibir é
 * tomada NO SERVIDOR a partir de `getNavSession()` — a visibilidade é conveniência de UI, nunca a
 * barreira de segurança das áreas restritas (FR-010/FR-011).
 *
 * US1 (P1): link público de Serviços + ação de Entrar/Sair + indicação de quem está logado
 * (FR-001/FR-002/FR-007). Os links por papel (Agendar/Meus agendamentos/Painel) entram na US2.
 */
export async function SiteHeader() {
  const { user } = await getNavSession();

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 p-4">
        <Link href="/" className="font-bold">
          Trimote
        </Link>
        <Link href="/services" className="text-sm hover:underline">
          Serviços
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              {/* Indicação de sessão ativa: identifica o usuário realmente logado (FR-007). */}
              <span className="text-sm text-neutral-500">{user.name ?? user.email}</span>
              <SignOutButton />
            </>
          ) : (
            <SignInButton />
          )}
        </div>
      </nav>
    </header>
  );
}
