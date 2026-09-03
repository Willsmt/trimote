import { redirect } from "next/navigation";

import { requireOwner, ForbiddenError, NeedsBusinessSelectionError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { BusinessSelectionScreen } from "@/components/owner/business-selection-screen";
import { BusinessWhatsappForm } from "@/components/owner/business-whatsapp-form";

export const dynamic = "force-dynamic";

// Dados do negócio (issue #52): primeira página de edição do próprio Business. Base extensível pros
// próximos campos da Camada 2 (endereço, aviso público etc.) — mesmo padrão de guarda das demais
// páginas de dono (requireOwner + tratamento dos 3 estados de autorização).
export default async function OwnerBusinessPage() {
  let active;
  try {
    active = await requireOwner();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/api/auth/signin?callbackUrl=/owner/business");
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

  const { businessId } = active;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { whatsapp: true },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Dados do negócio</h1>
        <p className="text-sm text-neutral-500">
          Informações exibidas na sua página pública.
        </p>
      </header>
      <BusinessWhatsappForm initialWhatsapp={business?.whatsapp ?? null} />
    </main>
  );
}
