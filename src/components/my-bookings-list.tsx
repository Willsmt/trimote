"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cancelBooking } from "@/server/actions/cancel-booking";

interface BookingItem {
  id: string;
  serviceName: string;
  startsAtIso: string;
  endsAtIso: string;
  status: "ACTIVE" | "CANCELLED";
}

const CANCEL_FAILURE_MESSAGES: Record<string, string> = {
  not_found: "Agendamento não encontrado.",
  not_owner: "Você não pode cancelar este agendamento.",
  already_cancelled: "Este agendamento já está cancelado.",
};

function formatRange(startIso: string, endIso: string): string {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
  }).format(new Date(startIso));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  return `${date} ${time(startIso)}–${time(endIso)}`;
}

export function MyBookingsList({ items }: { items: BookingItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onCancel(id: string) {
    setPendingId(id);
    setMessage(null);
    const result = await cancelBooking({ bookingId: id });
    setPendingId(null);
    if (result.ok) {
      setMessage("Agendamento cancelado.");
      router.refresh();
    } else {
      setMessage(CANCEL_FAILURE_MESSAGES[result.reason]);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">Você ainda não tem agendamentos.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {message && <p className="text-sm font-medium">{message}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded border border-neutral-300 p-3"
          >
            <div>
              <p className="font-medium">{item.serviceName}</p>
              <p className="text-sm text-neutral-500">
                {formatRange(item.startsAtIso, item.endsAtIso)}
              </p>
            </div>
            {item.status === "ACTIVE" ? (
              <button
                type="button"
                className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                onClick={() => onCancel(item.id)}
                disabled={pendingId === item.id}
              >
                Cancelar
              </button>
            ) : (
              <span className="text-sm text-neutral-400">Cancelado</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
