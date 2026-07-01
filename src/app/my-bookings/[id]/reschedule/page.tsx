import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { RescheduleFlow } from "@/components/reschedule-flow";

// Página de remarcação (US1). Exige sessão e valida a POSSE no servidor (FR-007/FR-010) — a
// visibilidade do link em "Meus agendamentos" é só conveniência; a barreira é aqui e no core.
export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/api/auth/signin?callbackUrl=/my-bookings/${id}/reschedule`);
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      startsAt: true,
      service: { select: { id: true, name: true, durationMinutes: true } },
    },
  });

  // Não-dono, inexistente, cancelado ou já passado: não remarca — volta à lista sem vazar detalhes.
  if (
    !booking ||
    booking.userId !== user.id ||
    booking.status !== "ACTIVE" ||
    booking.startsAt.getTime() <= Date.now()
  ) {
    redirect("/my-bookings");
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Remarcar agendamento</h1>
        <p className="text-sm text-neutral-500">Escolha um novo dia e horário livre.</p>
      </header>
      <RescheduleFlow
        bookingId={booking.id}
        serviceId={booking.service.id}
        serviceName={booking.service.name}
        durationMinutes={booking.service.durationMinutes}
        currentStartsAtIso={booking.startsAt.toISOString()}
      />
    </main>
  );
}
