import Link from "next/link";
import { Role } from "@prisma/client";

import { getNavSession } from "@/server/auth/session";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";

/**
 * Navegação global (003-nav-session, FR-008). Server Component: a DECISÃO de quais links exibir é
 * tomada NO SERVIDOR a partir de `getNavSession()` — a visibilidade é conveniência de UI, nunca a
 * barreira de segurança das áreas restritas (FR-010/FR-011).
 *
 * Links por papel (US2, contracts/nav-contract.md): qualquer autenticado vê Agendar e Meus
 * agendamentos (FR-005); só OWNER vê o Painel (FR-006). O papel vem de `getNavSession()` — lido do
 * banco no servidor, refletindo o estado atual e não um claim cacheado (FR-009). Papel ausente/não
 * reconhecido cai no menor privilégio (CLIENT-equivalente), nunca expondo o Painel.
 */
export async function SiteHeader() {
  const { user, role } = await getNavSession();
  const isOwner = role === Role.OWNER;

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 p-4">
        <Link href="/" className="font-bold">
          Trimote
        </Link>
        <Link href="/services" className="text-sm hover:underline">
          Serviços
        </Link>

        {/* Links de área logada (FR-005): visíveis a qualquer usuário autenticado. */}
        {user && (
          <>
            <Link href="/booking" className="text-sm hover:underline">
              Agendar
            </Link>
            <Link href="/my-bookings" className="text-sm hover:underline">
              Meus agendamentos
            </Link>
          </>
        )}

        {/* Painel do dono (FR-006): só OWNER. Esconder é conveniência de UI; a barreira real é o
            servidor (requireOwner), que permanece inalterado (FR-010/FR-011). */}
        {isOwner && (
          <Link href="/owner" className="text-sm hover:underline">
            Painel
          </Link>
        )}

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
