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
    <header className="border-b border-borda bg-superficie">
      <nav className="mx-auto flex max-w-3xl flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="font-fraunces text-2xl font-bold text-texto">
            trimote<span className="bg-[image:var(--ouro-metal)] bg-clip-text text-transparent">.</span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Indicação de sessão ativa: identifica o usuário realmente logado (FR-007). */}
                <span className="hidden text-sm text-texto-secundario sm:inline">{user.name ?? user.email}</span>
                <SignOutButton className="rounded-botao border border-borda px-3 py-1 text-sm text-texto transition-colors hover:border-primaria hover:text-primaria" />
              </>
            ) : (
              <SignInButton className="rounded-botao bg-primaria px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-primaria-hover" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Links de área logada (FR-005): visíveis a qualquer usuário autenticado. Agendar é por
              negócio (/b/[slug]); não há mais catálogo global (F007/US4). */}
          {user && (
            <>
              <Link href="/my-bookings" className="text-sm text-texto-secundario transition-colors hover:text-primaria">
                Meus agendamentos
              </Link>
              {/* Histórico dos próprios gastos (006, US5): qualquer autenticado; filtro por sessão no servidor. */}
              <Link href="/my-spending" className="text-sm text-texto-secundario transition-colors hover:text-primaria">
                Meus gastos
              </Link>
              {/* Perfil (034): edição do próprio telefone/WhatsApp. */}
              <Link href="/profile" className="text-sm text-texto-secundario transition-colors hover:text-primaria">
                Perfil
              </Link>
            </>
          )}

          {/* Painel do dono: só quem tem vínculo OWNER (F007 — posse por membership, não papel global).
              Esconder é conveniência; a barreira real é requireOwner no servidor. */}
          {isOwner && (
            <>
              <Link href="/owner" className="text-sm text-texto-secundario transition-colors hover:text-primaria">
                Painel
              </Link>
              <Link href="/owner/finance" className="text-sm text-texto-secundario transition-colors hover:text-primaria">
                Financeiro
              </Link>
            </>
          )}

          {/* Área ADMIN (F007, US1): só Role ADMIN. A barreira real é requireAdmin no servidor. */}
          {isAdmin && (
            <Link href="/admin" className="text-sm text-texto-secundario transition-colors hover:text-primaria">
              Admin
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
