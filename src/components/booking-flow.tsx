"use client";

import { useState } from "react";

import { getAvailableSlots } from "@/server/actions/get-available-slots";
import { createBooking } from "@/server/actions/create-booking";

interface ServiceOption {
  id: string;
  name: string;
  priceLabel: string;
  durationMinutes: number;
}

const FAILURE_MESSAGES: Record<string, string> = {
  slot_unavailable: "Horário indisponível. Escolha outro.",
  in_the_past: "Esse horário já passou.",
  outside_opening_hours: "Fora do horário de funcionamento.",
  service_not_found: "Serviço não encontrado.",
  service_inactive: "Esse serviço não está mais disponível. Escolha outro.",
  booking_limit_reached:
    "Você já tem o máximo de agendamentos ativos neste estabelecimento. Conclua ou cancele um deles para agendar outro.",
};

function formatSlot(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function BookingFlow({ services }: { services: ServiceOption[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Responsabilidade única: buscar slots (e reportar o resultado da PRÓPRIA busca — vazio/fechado).
  // NÃO limpa a mensagem: quem chama decide o estado inicial, para que uma mensagem de submit
  // (confirm) não seja apagada por um re-fetch no mesmo ciclo.
  async function loadSlots() {
    if (!serviceId || !date) {
      return;
    }
    setLoading(true);
    const result = await getAvailableSlots({ serviceId, date });
    setLoading(false);
    if (!result.ok) {
      setSlots([]);
      setMessage("Serviço não encontrado.");
      return;
    }
    setSlots(result.slots);
    if (result.slots.length === 0) {
      // Dia fechado != dia lotado (issue #22): sem a distincao, fechado parecia agenda cheia.
      setMessage(
        result.emptyReason === "closed" ? "Fechado neste dia." : "Nenhum horário livre nesse dia.",
      );
    }
  }

  async function confirm(startsAt: string) {
    setLoading(true);
    setMessage(null);
    try {
      const result = await createBooking({ serviceId, startsAt });
      // Recarrega a disponibilidade para refletir o horário ocupado (ou liberado em caso de recusa).
      // loadSlots já não mexe na mensagem; a do RESULTADO é setada DEPOIS do re-fetch para sobreviver.
      await loadSlots();
      setMessage(result.ok ? "Agendamento confirmado!" : FAILURE_MESSAGES[result.reason]);
    } catch {
      // Qualquer throw inesperado da action (sessão expirada, rede, erro do servidor) antes travava a
      // UI: loading ficava preso em true, os slots desabilitados e nenhuma mensagem aparecia. Aqui a
      // rejeição vira aviso genérico. NÃO re-fetchamos no erro (evita sobrescrever esta mensagem ou
      // relançar); ela sobrevive porque nada depois a limpa — loadSlots não mexe na mensagem (#27).
      setMessage("Não foi possível concluir agora. Tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Serviço
        <select
          className="rounded border border-neutral-300 p-2"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} — {service.priceLabel} ({service.durationMinutes} min)
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Dia
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
        onClick={() => {
          // Este fluxo começa limpo: a limpeza saiu de loadSlots, então é explícita aqui.
          setMessage(null);
          void loadSlots();
        }}
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
