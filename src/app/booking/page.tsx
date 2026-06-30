import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { BookingFlow } from "@/components/booking-flow";

// Guarda de autenticação (T022 / FR-001): visitante não autenticado é enviado ao login.
export default async function BookingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/api/auth/signin?callbackUrl=/booking");
  }

  const services = await prisma.barbershopService.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, price: true, durationMinutes: true },
  });

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const serviceOptions = services.map((service) => ({
    id: service.id,
    name: service.name,
    // Decimal não é serializável para o client — convertemos para rótulo formatado aqui.
    priceLabel: currency.format(Number(service.price)),
    durationMinutes: service.durationMinutes,
  }));

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Agendar serviço</h1>
        <p className="text-sm text-neutral-500">Escolha um serviço, um dia e um horário livre.</p>
      </header>
      <BookingFlow services={serviceOptions} />
    </main>
  );
}
