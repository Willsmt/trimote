import Link from "next/link";

/**
 * Rodapé global (issue #36). Enxuto, alinhado à navegação minimalista do projeto (CLAUDE.md): só a
 * marca e o link permanente para a Política de Privacidade.
 *
 * Motivação LGPD: a Política precisa ficar acessível PERMANENTEMENTE, não só pela faixa de cookies
 * (que some após "Entendi"). O rodapé é esse acesso permanente.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-neutral-200">
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-2 p-4 text-sm text-neutral-500 sm:flex-row">
        <span>Trimote © {year}</span>
        <Link href="/privacidade" className="hover:underline">
          Política de Privacidade
        </Link>
      </div>
    </footer>
  );
}
