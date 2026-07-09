"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cancelBooking } from "@/server/actions/cancel-booking";

interface BookingItem {
  id: string;
  serviceName: string;
  businessName: string;
  startsAtIso: string;
  endsAtIso: string;
  status: "ACTIVE" | "CANCELLED" | "COMPLETED";
}

const CANCEL_FAILURE_MESSAGES: Record<string, string> = {
  not_found: "Agendamento não encontrado.",
  not_owner: "Você não pode cancelar este agendamento.",
  already_cancelled: "Este agendamento já está cancelado.",
  already_completed: "Este atendimento já foi concluído e não pode ser cancelado.",
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

/**
 * Lista de agendamentos do cliente (issue #2 - curadoria de exibicao). Os cancelados/concluidos
 * poluiam a visao ao ficarem misturados aos ativos. Aqui a lista e PARTICIONADA por STATUS (nao por
 * tempo): ACTIVE = ativos acionaveis (incl. ACTIVE ja passado, que segue cancelavel); CANCELLED +
 * COMPLETED = historico, esmaecido, sem acoes, oculto por padrao sob um toggle. Nenhum dado e
 * alterado no banco — e so exibicao; o clientId continua vindo da sessao no servidor.
 */
export function MyBookingsList({ items }: { items: BookingItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false); // estado em memoria (sem storage)

  // Ativos: mais proximo primeiro (asc). Historico: mais recente primeiro (desc). ISO ordena cronologico.
  const active = useMemo(
    () =>
      items
        .filter((i) => i.status === "ACTIVE")
        .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso)),
    [items],
  );
  const history = useMemo(
    () =>
      items
        .filter((i) => i.status !== "ACTIVE")
        .sort((a, b) => b.startsAtIso.localeCompare(a.startsAtIso)),
    [items],
  );

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

  function renderRow(item: BookingItem) {
    return (
      <li
        key={item.id}
        className="flex items-center justify-between rounded border border-neutral-300 p-3"
      >
        <div>
          <p className="font-medium">{item.serviceName} · {item.businessName}</p>
          <p className="text-sm text-neutral-500">{formatRange(item.startsAtIso, item.endsAtIso)}</p>
        </div>
        {item.status === "ACTIVE" ? (
          <div className="flex items-center gap-2">
            {/* Remarcar aparece só para ativos E futuros (conveniência; o servidor revalida — FR-010). */}
            {new Date(item.startsAtIso).getTime() > Date.now() && (
              <Link
                href={`/my-bookings/${item.id}/reschedule`}
                className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                Remarcar
              </Link>
            )}
            <button
              type="button"
              className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              onClick={() => onCancel(item.id)}
              disabled={pendingId === item.id}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span className="text-sm text-neutral-400">
            {item.status === "COMPLETED" ? "Concluído" : "Cancelado"}
          </span>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message && <p className="text-sm font-medium">{message}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">Agendamentos ativos</h2>
        {active.length === 0 ? (
          <p className="text-sm text-neutral-500">Você não tem agendamentos ativos.</p>
        ) : (
          <ul className="flex flex-col gap-2">{active.map(renderRow)}</ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="self-start text-sm text-neutral-500 hover:underline"
          >
            {showHistory ? "Ocultar histórico" : `Mostrar histórico (${history.length})`}
          </button>
          {showHistory && <ul className="flex flex-col gap-2 opacity-70">{history.map(renderRow)}</ul>}
        </section>
      )}
    </div>
  );
}
