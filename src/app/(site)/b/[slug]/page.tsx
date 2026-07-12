import { notFound } from "next/navigation";

import { prisma } from "@/server/db/client";
import { listServicesForBusiness } from "@/server/actions/list-services";
import { getAvailableSlots } from "@/server/actions/get-available-slots";
import { getCurrentUser } from "@/server/auth/session";
import { todayInZone } from "@/domain/time";
import { BookingFlow } from "@/components/booking-flow";

export const dynamic = "force-dynamic";

// Página pública do negócio por slug (007, US4). Porta de entrada do cliente (QR/Instagram): mostra os
// serviços DAQUELE negócio e agenda nele (o serviço carrega o businessId). Slug inválido → 404 tratado.
export default async function BusinessPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // Retorno pós-login: dica de UI para restaurar o slot pretendido (revalidada abaixo, nunca confiada).
  searchParams: Promise<{ serviceId?: string; startsAt?: string }>;
}) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true, _count: { select: { openingHours: true } } },
  });
  if (!business) notFound();

  const services = await listServicesForBusiness(business.id);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const serviceOptions = services.map((s) => ({
    id: s.id,
    name: s.name,
    priceLabel: currency.format(Number(s.price)),
    durationMinutes: s.durationMinutes,
  }));

  // Negócio recém-criado (issue #12): sem serviço ativo ou sem expediente, a agenda ainda não opera.
  // Sem expediente o BookingFlow mostraria "Nenhum horário livre nesse dia." em TODO dia — parece
  // agenda lotada, quando o negócio nunca abre. Mensagem contextual no lugar, nunca o fluxo enganoso.
  const isReadyForBooking = serviceOptions.length > 0 && business._count.openingHours > 0;

  // Gate de login: a página continua PÚBLICA (visitante navega os slots). Lemos a sessão UMA vez só
  // para decidir o comportamento do CLIQUE no cliente. Escopo mínimo — um booleano, nunca dados da sessão.
  const isAuthenticated = Boolean(await getCurrentUser());

  // Restauração pós-login (dica de UI, NUNCA fonte de verdade): se o callbackUrl trouxe serviceId +
  // startsAt, REVALIDAMOS no servidor — o serviço tem de ser DESTE negócio e o slot tem de continuar
  // livre AGORA. O que decide o agendamento continua sendo requireUser + a constraint na mutação.
  const { serviceId: rawServiceId, startsAt: rawStartsAt } = await searchParams;
  let restored: { serviceId: string; date: string; startsAt: string } | undefined;
  let restoreError = false;
  if (isReadyForBooking && rawServiceId && rawStartsAt) {
    const belongsToBusiness = serviceOptions.some((s) => s.id === rawServiceId);
    const startInstant = new Date(rawStartsAt);
    const validInstant = !Number.isNaN(startInstant.getTime());
    if (belongsToBusiness && validInstant) {
      const date = todayInZone(startInstant, business.timezone);
      const availability = await getAvailableSlots({ serviceId: rawServiceId, date });
      if (availability.ok && availability.slots.includes(startInstant.toISOString())) {
        restored = { serviceId: rawServiceId, date, startsAt: startInstant.toISOString() };
      } else {
        // Slot sumiu no round-trip do OAuth (ou serviço inativou): cai no fluxo normal com aviso.
        restoreError = true;
      }
    } else {
      restoreError = true;
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <p className="text-sm text-neutral-500">
          {isReadyForBooking
            ? "Escolha um serviço, um dia e um horário livre."
            : "Agenda em preparação."}
        </p>
      </header>
      {isReadyForBooking ? (
        <BookingFlow
          services={serviceOptions}
          slug={slug}
          isAuthenticated={isAuthenticated}
          restored={restored}
          restoreError={restoreError}
        />
      ) : (
        <p className="text-sm text-neutral-500">
          {business.name} está preparando a agenda. Volte em breve para marcar seu horário por aqui.
        </p>
      )}
    </main>
  );
}
