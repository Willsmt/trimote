import { redirect } from "next/navigation";

import { requireOwner, ForbiddenError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { getOwnerBarbershopId } from "@/server/owner/barbershop";
import { prisma } from "@/server/db/client";
import { LedgerManager } from "@/components/owner/ledger-manager";

export const dynamic = "force-dynamic";

// Guarda de dono no servidor (FR-018): visitante vai ao login; cliente comum é recusado. A captura
// financeira (concluir/walk-in/despesa/inativar) só é oferecida ao OWNER; as Server Actions revalidam.
export default async function OwnerLedgerPage() {
  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/api/auth/signin?callbackUrl=/owner/ledger");
    }
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const barbershopId = await getOwnerBarbershopId();

  // Agenda ativa (para escolher qual atendimento concluir) e serviços ativos (para walk-in/extras).
  // NÃO há relatório/agregação/caixa aqui — isso é F006.
  const [bookings, services] = await Promise.all([
    prisma.booking.findMany({
      where: { barbershopId, status: "ACTIVE" },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        service: { select: { name: true, price: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.barbershopService.findMany({
      where: { barbershopId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true },
    }),
  ]);

  const activeBookings = bookings.map((b) => ({
    id: b.id,
    startsAtIso: b.startsAt.toISOString(),
    serviceName: b.service.name,
    servicePrice: b.service.price.toString(),
    clientLabel: b.user.name ?? b.user.email ?? "Cliente",
  }));
  const activeServices = services.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price.toString(),
  }));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-neutral-500">
          Concluir atendimento, registrar avulso e despesa, e corrigir lançamentos.
        </p>
      </header>
      <LedgerManager bookings={activeBookings} services={activeServices} />
    </main>
  );
}
