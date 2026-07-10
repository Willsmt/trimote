import { notFound } from "next/navigation";

import { prisma } from "@/server/db/client";
import { listServicesForBusiness } from "@/server/actions/list-services";
import { BookingFlow } from "@/components/booking-flow";

export const dynamic = "force-dynamic";

// Página pública do negócio por slug (007, US4). Porta de entrada do cliente (QR/Instagram): mostra os
// serviços DAQUELE negócio e agenda nele (o serviço carrega o businessId). Slug inválido → 404 tratado.
export default async function BusinessPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, _count: { select: { openingHours: true } } },
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
        <BookingFlow services={serviceOptions} />
      ) : (
        <p className="text-sm text-neutral-500">
          {business.name} está preparando a agenda. Volte em breve para marcar seu horário por aqui.
        </p>
      )}
    </main>
  );
}
