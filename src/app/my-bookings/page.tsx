import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { listBookingsForUser } from "@/server/booking/list-my-bookings";
import { MyBookingsList } from "@/components/my-bookings-list";

// Guarda de autenticação (FR-001): visitante não autenticado vai ao login.
export default async function MyBookingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/api/auth/signin?callbackUrl=/my-bookings");
  }

  const bookings = await listBookingsForUser(user.id);
  // Datas não são serializáveis para o client — enviamos ISO e formatamos lá.
  const items = bookings.map((booking) => ({
    id: booking.id,
    serviceName: booking.serviceName,
    businessName: booking.businessName,
    startsAtIso: booking.startsAt.toISOString(),
    endsAtIso: booking.endsAt.toISOString(),
    status: booking.status,
  }));

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Meus agendamentos</h1>
        <p className="text-sm text-neutral-500">Veja e cancele seus agendamentos.</p>
      </header>
      <MyBookingsList items={items} />
    </main>
  );
}
