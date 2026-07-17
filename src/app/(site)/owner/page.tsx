import Link from "next/link";
import { redirect } from "next/navigation";

import { SITE_URL } from "@/config/site";
import { requireOwner, ForbiddenError, NeedsBusinessSelectionError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { listTodayScheduleForOwner } from "@/server/booking/list-today-schedule";
import { BusinessSelectionScreen } from "@/components/owner/business-selection-screen";
import { TodaySchedule } from "@/components/owner/today-schedule";
import { PublicPageCard } from "@/components/owner/public-page-card";
import { SetupChecklist } from "@/components/owner/setup-checklist";

export const dynamic = "force-dynamic";

// Entrada do painel (FR-001): visitante vai ao login; cliente comum é recusado; só OWNER acessa.
export default async function OwnerHomePage() {
  let active;
  try {
    active = await requireOwner();
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

  // Agenda do dia (issue #13): businessId/timeZone vêm do vínculo (requireOwner), nunca do input.
  // Datas serializadas em ISO para a ilha client (issue #25: ações por linha), padrão das demais ilhas.
  const { businessId, timeZone } = active;
  const schedule = await listTodayScheduleForOwner({ businessId, timeZone });
  const scheduleItems = schedule.map((item) => ({
    id: item.id,
    startsAtIso: item.startsAt.toISOString(),
    endsAtIso: item.endsAt.toISOString(),
    serviceName: item.serviceName,
    clientName: item.clientName,
    clientEmail: item.clientEmail,
    clientPhone: item.clientPhone,
  }));

  // Página pública do negócio (issue #15): slug do negócio ATIVO (nunca do input); URL montada no
  // SERVER a partir de SITE_URL (issue #44) — a URL que o dono copia é a canônica do site, não a
  // de callback do OAuth (NEXTAUTH_URL divergiria em preview/local).
  // O _count alimenta o checklist de setup (issue #12) na mesma query: serviços ATIVOS (soft delete
  // da F002 — desativados não contam como configurado) e dias de expediente.
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      slug: true,
      _count: { select: { services: { where: { isActive: true } }, openingHours: true } },
    },
  });
  const publicUrl = business ? `${SITE_URL}/b/${business.slug}` : null;
  const setupComplete =
    !business || (business._count.services > 0 && business._count.openingHours > 0);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Painel do dono</h1>
        <p className="text-sm text-neutral-500">Gerencie o catálogo e o horário de funcionamento.</p>
      </header>

      {!setupComplete && business && (
        <SetupChecklist
          activeServicesCount={business._count.services}
          openingHoursCount={business._count.openingHours}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Agenda de hoje</h2>
        <TodaySchedule items={scheduleItems} timeZone={timeZone} />
      </section>

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

      {publicUrl && <PublicPageCard publicUrl={publicUrl} />}
    </main>
  );
}
