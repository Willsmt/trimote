import { redirect } from "next/navigation";

import { requireOwner, ForbiddenError, NeedsBusinessSelectionError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { listServicesForOwner } from "@/server/actions/list-services-for-owner";
import { ServicesManager } from "@/components/owner/services-manager";
import { BusinessSelectionScreen } from "@/components/owner/business-selection-screen";

export const dynamic = "force-dynamic";

// Guarda de dono no servidor (FR-001): visitante vai ao login; cliente comum é recusado.
export default async function OwnerServicesPage() {
  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/api/auth/signin?callbackUrl=/owner/services");
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

  const services = await listServicesForOwner();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Gerenciar serviços</h1>
        <p className="text-sm text-neutral-500">Criar, editar e ativar/desativar serviços.</p>
      </header>
      <ServicesManager services={services} />
    </main>
  );
}
