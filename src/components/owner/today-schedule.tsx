"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";

import { completeBooking } from "@/server/actions/complete-booking";
import { cancelBookingByOwner } from "@/server/actions/cancel-booking-owner";

/**
 * Agenda do dia do painel do dono (issue #13; ações por linha na issue #25). Era Server Component de
 * leitura; virou ilha client para oferecer Concluir/Cancelar NO CONTEXTO (princípio de navegação —
 * a informação e a ação no mesmo lugar). Datas chegam serializadas (ISO) do Server Component, padrão
 * das demais ilhas. Formata os horários no FUSO do negócio (derivado de requireOwner na página).
 *
 * Concluir = mini-diálogo inline (forma de pagamento opcional, SEM extras — caso com extras continua
 * no /owner/ledger); a linha fica limpa até o clique. Sucesso de qualquer ação: router.refresh() — a
 * linha some (deixa de ser ACTIVE) e o resto do painel atualiza.
 */

export interface TodayScheduleItemDTO {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  serviceName: string;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
}

// Mapa completo reason -> mensagem (pt-BR) das DUAS actions da linha. Nenhum reason órfão:
// completeBooking (005: booking_not_found, already_completed, booking_cancelled, service_not_found,
// invalid_amount, invalid_description — os três últimos impossíveis sem extras, cobertos mesmo assim)
// e cancelBookingByOwner (025: not_found, already_cancelled, already_completed — compartilhado).
const FAILURE_MESSAGES: Record<string, string> = {
  booking_not_found: "Agendamento não encontrado.",
  not_found: "Agendamento não encontrado.",
  already_completed: "Este atendimento já foi concluído e não pode ser alterado.",
  booking_cancelled: "Este agendamento está cancelado e não pode ser concluído.",
  already_cancelled: "Este agendamento já está cancelado.",
  service_not_found: "Serviço não encontrado.",
  invalid_amount: "Informe um valor maior que zero.",
  invalid_description: "Informe uma descrição.",
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Dinheiro" },
  { value: "PIX", label: "Pix" },
  { value: "CARD", label: "Cartão" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Outro" },
];

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** E.164 (+5511999999999) → exibição legível (11) 99999-9999; fallback: o próprio valor. */
function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const national = digits.length === 13 ? digits.slice(2) : digits;
  if (national.length !== 11) return e164;
  return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

export function TodaySchedule({
  items,
  timeZone,
}: {
  items: TodayScheduleItemDTO[];
  timeZone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Guarda SÍNCRONA contra double-click (padrão do LedgerManager, nascido de bug real de walk-in
  // duplicado): o Concluir cria LedgerEntry — clique duplo seria receita duplicada no caixa.
  const submittingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  // Linha com o mini-diálogo de conclusão aberto (pagamento opcional).
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [payment, setPayment] = useState("");

  function run(
    action: () => Promise<{ ok: true } | { ok: false; reason: string }>,
    onSuccess: () => void,
  ) {
    if (submittingRef.current) return; // submit em andamento — ignora o clique repetido
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          onSuccess();
          router.refresh();
        } else {
          setMessage(FAILURE_MESSAGES[result.reason] ?? "Não foi possível concluir a operação.");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function toggleComplete(id: string) {
    setPayment("");
    setCompletingId((current) => (current === id ? null : id));
  }

  function onConfirmComplete(id: string) {
    if (!confirm("Concluir este atendimento? Isso registra a receita no caixa.")) return;
    run(
      () =>
        completeBooking({
          bookingId: id,
          paymentMethod: payment ? (payment as PaymentMethod) : undefined,
        }),
      () => {
        setCompletingId(null);
        setMessage("Atendimento concluído — receita registrada no caixa.");
      },
    );
  }

  function onCancel(id: string) {
    if (!confirm("Cancelar este agendamento? O horário fica livre para outros clientes.")) return;
    run(
      () => cancelBookingByOwner({ bookingId: id }),
      () => {
        setCompletingId(null);
        setMessage("Agendamento cancelado — horário liberado.");
      },
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {message && (
          <p className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm font-medium">
            {message}
          </p>
        )}
        <p className="text-sm text-neutral-500">Nenhum atendimento agendado para hoje.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {message && (
        <p className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm font-medium">
          {message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded border border-neutral-300 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {formatTime(item.startsAtIso, timeZone)}–{formatTime(item.endsAtIso, timeZone)} ·{" "}
                  {item.serviceName}
                </p>
                <p className="text-sm text-neutral-500">
                  {item.clientName ?? item.clientEmail ?? "Cliente"}
                </p>
                {/* WhatsApp do cliente (issue #34): só se preenchido; abre em nova aba para não tirar
                    o dono da agenda. wa.me usa E.164 sem o '+'. Ausente = nada (não quebra a linha). */}
                {item.clientPhone && (
                  <a
                    href={`https://wa.me/${item.clientPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-emerald-700 underline"
                  >
                    WhatsApp: {formatPhoneDisplay(item.clientPhone)}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-emerald-700 underline disabled:opacity-50"
                  disabled={isPending}
                  onClick={() => toggleComplete(item.id)}
                >
                  Concluir
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 underline disabled:opacity-50"
                  disabled={isPending}
                  onClick={() => onCancel(item.id)}
                >
                  Cancelar
                </button>
              </div>
            </div>

            {completingId === item.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-2">
                <select
                  className="rounded border border-neutral-300 p-1 text-xs"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                >
                  <option value="">Forma de pagamento (opcional)</option>
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm.value} value={pm.value}>
                      {pm.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                  disabled={isPending}
                  onClick={() => onConfirmComplete(item.id)}
                >
                  {isPending ? "Concluindo..." : "Concluir e registrar"}
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                  onClick={() => setCompletingId(null)}
                >
                  Voltar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
