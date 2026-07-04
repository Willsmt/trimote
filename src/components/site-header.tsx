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
  const { user, role, isOwner } = await getNavSession();
  const isAdmin = role === Role.ADMIN;

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 p-4">
        <Link href="/" className="font-bold">
          Trimote
        </Link>

        {/* Links de área logada (FR-005): visíveis a qualquer usuário autenticado. Agendar é por
            negócio (/b/[slug]); não há mais catálogo global (F007/US4). */}
        {user && (
          <>
            <Link href="/my-bookings" className="text-sm hover:underline">
              Meus agendamentos
            </Link>
            {/* Histórico dos próprios gastos (006, US5): qualquer autenticado; filtro por sessão no servidor. */}
            <Link href="/my-spending" className="text-sm hover:underline">
              Meus gastos
            </Link>
          </>
        )}

        {/* Painel do dono: só quem tem vínculo OWNER (F007 — posse por membership, não papel global).
            Esconder é conveniência; a barreira real é requireOwner no servidor. */}
        {isOwner && (
          <>
            <Link href="/owner" className="text-sm hover:underline">
              Painel
            </Link>
            <Link href="/owner/finance" className="text-sm hover:underline">
              Financeiro
            </Link>
          </>
        )}

        {/* Área ADMIN (F007, US1): só Role ADMIN. A barreira real é requireAdmin no servidor. */}
        {isAdmin && (
          <Link href="/admin" className="text-sm hover:underline">
            Admin
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
