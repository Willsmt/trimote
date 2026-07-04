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
    select: { id: true, name: true },
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

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <p className="text-sm text-neutral-500">Escolha um serviço, um dia e um horário livre.</p>
      </header>
      {serviceOptions.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum serviço disponível no momento.</p>
      ) : (
        <BookingFlow services={serviceOptions} />
      )}
    </main>
  );
}
