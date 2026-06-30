import { redirect } from "next/navigation";

import { requireOwner, ForbiddenError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { listOpeningHoursForOwner } from "@/server/actions/list-opening-hours-for-owner";
import { OpeningHoursManager } from "@/components/owner/opening-hours-manager";

export const dynamic = "force-dynamic";

// Guarda de dono no servidor (FR-001): visitante vai ao login; cliente comum é recusado.
export default async function OwnerOpeningHoursPage() {
  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/api/auth/signin?callbackUrl=/owner/opening-hours");
    }
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const openingHours = await listOpeningHoursForOwner();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Horário de funcionamento</h1>
        <p className="text-sm text-neutral-500">
          Defina abertura e fechamento por dia ou marque o dia como fechado.
        </p>
      </header>
      <OpeningHoursManager openingHours={openingHours} />
    </main>
  );
}
