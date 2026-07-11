"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

import { getAvailableSlots } from "@/server/actions/get-available-slots";
import { createBooking } from "@/server/actions/create-booking";

interface ServiceOption {
  id: string;
  name: string;
  priceLabel: string;
  durationMinutes: number;
}

/** Seleção restaurada pós-login (dica de UI já revalidada no servidor): negócio + serviço + slot. */
interface RestoredSelection {
  serviceId: string;
  date: string; // YYYY-MM-DD no fuso do negócio
  startsAt: string; // ISO 8601 (UTC) do slot pretendido, a destacar
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

export function BookingFlow({
  services,
  slug,
  isAuthenticated,
  restored,
  restoreError,
}: {
  services: ServiceOption[];
  /** Slug do negócio — necessário para montar o callbackUrl do login sem inventar rota. */
  slug: string;
  /** Lido UMA vez no servidor (escopo mínimo): decide se o clique agenda ou abre o gate de login. */
  isAuthenticated: boolean;
  /** Presente quando o retorno do OAuth trouxe um slot que o servidor REVALIDOU como ainda livre. */
  restored?: RestoredSelection;
  /** true quando vieram params de retorno mas o slot não sobreviveu ao round-trip (sumiu/inválido). */
  restoreError?: boolean;
}) {
  const [serviceId, setServiceId] = useState(restored?.serviceId ?? services[0]?.id ?? "");
  const [date, setDate] = useState(restored?.date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(
    restoreError
      ? "Esse horário não está mais livre. Escolha outro abaixo."
      : restored
        ? "Você voltou — confirme seu horário abaixo."
        : null,
  );
  const [loading, setLoading] = useState(false);
  // Slot que um VISITANTE clicou: dispara o gate "Entre para agendar" sem chamar a action (o clique
  // do não-logado não pode escrever). Nulo = sem gate aberto.
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);

  // Retorno do OAuth: o servidor já garantiu que o slot está livre; aqui só carregamos o dia para
  // exibir e destacar o horário pretendido. Roda uma vez, no mount.
  useEffect(() => {
    if (restored) {
      void loadSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O slot em evidência: o que o visitante clicou (gate aberto) ou o restaurado pós-login.
  const emphasizedSlot = pendingSlot ?? restored?.startsAt ?? null;

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

  // Clique num slot: logado agenda direto (clique-agenda padrão); visitante abre o gate de login,
  // levando serviço + slot no callbackUrl para voltar exatamente aqui (dica de UI, revalidada no servidor).
  function onSlotClick(startsAt: string) {
    if (!isAuthenticated) {
      setPendingSlot(startsAt);
      return;
    }
    void confirm(startsAt);
  }

  function startLogin(startsAt: string) {
    const query = new URLSearchParams({ serviceId, startsAt });
    void signIn("google", { callbackUrl: `/b/${slug}?${query.toString()}` });
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

      {pendingSlot && (
        // Gate de login do visitante: sem rota nova, um estado contextual no próprio fluxo.
        <div className="flex flex-col gap-2 rounded border border-neutral-900 bg-neutral-50 p-3 text-sm">
          <p className="font-medium">Entre para agendar às {formatSlot(pendingSlot)}.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-neutral-900 px-3 py-1 text-white"
              onClick={() => startLogin(pendingSlot)}
            >
              Entrar com Google
            </button>
            <button
              type="button"
              className="rounded border border-neutral-300 px-3 py-1"
              onClick={() => setPendingSlot(null)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              className={`rounded border p-2 text-sm hover:bg-neutral-100 disabled:opacity-50 ${
                slot === emphasizedSlot
                  ? "border-neutral-900 font-medium ring-2 ring-neutral-900"
                  : "border-neutral-300"
              }`}
              onClick={() => onSlotClick(slot)}
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
