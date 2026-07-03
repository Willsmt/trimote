import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOwner, ForbiddenError, NeedsBusinessSelectionError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { BusinessSelectionScreen } from "@/components/owner/business-selection-screen";

export const dynamic = "force-dynamic";

// Entrada do painel (FR-001): visitante vai ao login; cliente comum é recusado; só OWNER acessa.
export default async function OwnerHomePage() {
  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/api/auth/signin?callbackUrl=/owner");
    }
    // needs_selection é ESTADO DE UI (dono de 2+ negócios sem ativo): renderiza o seletor, não explode.
    if (error instanceof NeedsBusinessSelectionError) {
      return <BusinessSelectionScreen options={error.options} />;
    }
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Painel do dono</h1>
        <p className="text-sm text-neutral-500">Gerencie o catálogo e o horário de funcionamento.</p>
      </header>
      <nav className="flex flex-col gap-2">
        <Link href="/owner/services" className="rounded border border-neutral-300 p-3 hover:bg-neutral-50">
          Gerenciar serviços
        </Link>
        <Link
          href="/owner/opening-hours"
          className="rounded border border-neutral-300 p-3 hover:bg-neutral-50"
        >
          Horário de funcionamento
        </Link>
        <Link href="/owner/ledger" className="rounded border border-neutral-300 p-3 hover:bg-neutral-50">
          Financeiro
        </Link>
      </nav>
    </main>
  );
}
