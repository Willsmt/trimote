"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getAvailableSlots } from "@/server/actions/get-available-slots";
import { rescheduleBooking } from "@/server/actions/reschedule-booking";

interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
}

interface RescheduleFlowProps {
  bookingId: string;
  /** Serviço atual do agendamento — default do seletor. */
  currentServiceId: string;
  /** Serviços selecionáveis: ativos + o atual (mesmo se inativo, para permitir mantê-lo). */
  services: ServiceOption[];
  /** Horário atual do agendamento (ISO) — exibido como referência. */
  currentStartsAtIso: string;
}

// Mapa completo de reason → mensagem amigável (contrato 004). Todas em português.
const FAILURE_MESSAGES: Record<string, string> = {
  not_found: "Agendamento não encontrado.",
  not_owner: "Você não pode remarcar este agendamento.",
  not_active: "Este agendamento não está mais ativo.",
  already_completed: "Este atendimento já foi concluído e não pode ser remarcado.",
  booking_in_past: "Este agendamento já passou e não pode ser remarcado.",
  service_not_found: "Serviço não encontrado.",
  service_inactive: "Esse serviço não está mais disponível. Escolha outro.",
  in_the_past: "Esse horário já passou.",
  outside_opening_hours: "Fora do horário de funcionamento.",
  no_change: "Esse já é o horário e serviço atuais do agendamento.",
  slot_unavailable: "Horário indisponível. Escolha outro.",
};

function formatSlot(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function RescheduleFlow({
  bookingId,
  currentServiceId,
  services,
  currentStartsAtIso,
}: RescheduleFlowProps) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(currentServiceId);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Ao trocar de serviço, os horários já carregados valem para o serviço anterior — limpa até
  // recarregar com a duração do novo serviço.
  function onServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    setSlots([]);
    setMessage(null);
  }

  async function loadSlots() {
    if (!serviceId || !date) {
      return;
    }
    setLoading(true);
    setMessage(null);
    // excludeBookingId: o próprio agendamento não bloqueia seu horário/adjacências (D1).
    const result = await getAvailableSlots({ serviceId, date, excludeBookingId: bookingId });
    setLoading(false);
    if (!result.ok) {
      setSlots([]);
      setMessage("Serviço não encontrado.");
      return;
    }
    setSlots(result.slots);
    if (result.slots.length === 0) {
      setMessage("Nenhum horário livre nesse dia.");
    }
  }

  async function confirm(startsAt: string) {
    setLoading(true);
    setMessage(null);
    const result = await rescheduleBooking({ bookingId, serviceId, startsAt });
    setLoading(false);
    if (result.ok) {
      setMessage("Agendamento remarcado!");
      router.push("/my-bookings");
      router.refresh();
      return;
    }
    setMessage(FAILURE_MESSAGES[result.reason]);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">
        Horário atual: <span className="font-medium text-neutral-800">{formatDateTime(currentStartsAtIso)}</span>
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Serviço
        <select
          className="rounded border border-neutral-300 p-2"
          value={serviceId}
          onChange={(event) => onServiceChange(event.target.value)}
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} ({service.durationMinutes} min)
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Novo dia
        <input
          type="date"
          className="rounded border border-neutral-300 p-2"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>

      <button
        type="button"
        className="rounded bg-neutral-900 p-2 text-white disabled:opacity-50"
        onClick={loadSlots}
        disabled={loading || !serviceId || !date}
      >
        Ver horários livres
      </button>

      {message && <p className="text-sm font-medium">{message}</p>}

      {slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              className="rounded border border-neutral-300 p-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
              onClick={() => confirm(slot)}
              disabled={loading}
            >
              {formatSlot(slot)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
