"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";

import { completeBooking } from "@/server/actions/complete-booking";
import { registerWalkIn } from "@/server/actions/register-walk-in";
import { registerExpense } from "@/server/actions/register-expense";
import { deactivateLedgerEntry } from "@/server/actions/deactivate-ledger-entry";

// Mapa completo reason -> mensagem (pt-BR) de TODOS os fluxos do ledger (T022). Nenhum reason órfão:
// mesma disciplina que evita mensagem ausente (bug do no_change). SEM relatório/agregação (F006).
const FAILURE_MESSAGES: Record<string, string> = {
  booking_not_found: "Agendamento não encontrado.",
  already_completed: "Este atendimento já foi concluído e não pode ser alterado.",
  booking_cancelled: "Este agendamento está cancelado e não pode ser concluído.",
  invalid_amount: "Informe um valor maior que zero.",
  no_items: "Adicione ao menos um item ao atendimento.",
  service_not_found: "Serviço não encontrado.",
  client_not_found: "Cliente não encontrado.",
  entry_not_found: "Lançamento não encontrado.",
  already_inactive: "Este lançamento já está inativo.",
};

interface BookingOption {
  id: string;
  startsAtIso: string;
  serviceName: string;
  servicePrice: string; // usado só para o feedback de valor registrado (exibição)
  clientLabel: string;
}

interface ServiceOption {
  id: string;
  name: string;
  price: string;
}

// Linha de item (walk-in) / extra (conclusão): serviço do catálogo (snapshot) OU manual.
interface ItemRow {
  serviceId: string; // "" = manual
  description: string;
  amount: string;
}

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "PIX", "CARD", "ONLINE", "OTHER"];

type LedgerActionResult =
  | { ok: true; ledgerEntryId?: string }
  | { ok: false; reason: string };

type BusyForm = "complete" | "walkin" | "expense" | "deactivate";

function emptyRow(): ItemRow {
  return { serviceId: "", description: "", amount: "" };
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function LedgerManager({
  bookings,
  services,
}: {
  bookings: BookingOption[];
  services: ServiceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Guarda SÍNCRONA contra double-click: fecha a janela de corrida entre o clique e o re-render que
  // desabilita o botão (foi o que duplicou o walk-in "julio" no smoke). O `isPending` cuida do
  // rótulo/disabled; o ref garante submit único mesmo em cliques quase simultâneos.
  const submittingRef = useRef(false);
  const [busy, setBusy] = useState<BusyForm | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Último lançamento criado — permite corrigir por soft delete sem listar/agrupar (fora de F006).
  const [lastEntryId, setLastEntryId] = useState<string | null>(null);

  // Conclusão
  const [bookingId, setBookingId] = useState("");
  const [completePayment, setCompletePayment] = useState("");
  const [completeExtras, setCompleteExtras] = useState<ItemRow[]>([]);

  // Walk-in
  const [walkInItems, setWalkInItems] = useState<ItemRow[]>([emptyRow()]);
  const [walkInClientName, setWalkInClientName] = useState("");
  const [walkInPayment, setWalkInPayment] = useState("");

  // Despesa
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expensePayment, setExpensePayment] = useState("");

  function servicePrice(id: string): number {
    return Number(services.find((s) => s.id === id)?.price ?? 0);
  }

  function serviceName(id: string): string {
    return services.find((s) => s.id === id)?.name ?? "Item";
  }

  // Total apenas para EXIBIÇÃO (o valor autoritativo é o do servidor). Serviço = preço do catálogo;
  // manual = valor informado.
  function itemsTotal(rows: ItemRow[]): number {
    return rows
      .filter((r) => r.serviceId || r.description || r.amount)
      .reduce((sum, r) => sum + (r.serviceId ? servicePrice(r.serviceId) : Number(r.amount) || 0), 0);
  }

  // Converte linhas de item para o payload do core (serviço = snapshot; manual = valor informado).
  function toItems(rows: ItemRow[]) {
    return rows
      .filter((r) => r.serviceId || r.description || r.amount)
      .map((r) =>
        r.serviceId
          ? { serviceId: r.serviceId, description: r.description || serviceName(r.serviceId) }
          : { description: r.description, amount: Number(r.amount) },
      );
  }

  function asPayment(value: string): PaymentMethod | undefined {
    return value ? (value as PaymentMethod) : undefined;
  }

  // Executa a ação com prevenção de submit duplicado e reset dos campos no sucesso.
  function run(
    form: BusyForm,
    action: () => Promise<LedgerActionResult>,
    onSuccess: () => void,
  ) {
    if (submittingRef.current) return; // já há um submit em andamento — ignora o clique repetido
    submittingRef.current = true;
    setBusy(form);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setLastEntryId(result.ledgerEntryId ?? null);
          onSuccess(); // reset dos campos + mensagem de sucesso com o valor
          router.refresh();
        } else {
          setMessage(FAILURE_MESSAGES[result.reason] ?? "Não foi possível concluir a operação.");
        }
      } finally {
        submittingRef.current = false;
        setBusy(null);
      }
    });
  }

  function onComplete() {
    if (!bookingId) {
      setMessage("Escolha um atendimento.");
      return;
    }
    const booking = bookings.find((b) => b.id === bookingId);
    const total = (booking ? Number(booking.servicePrice) : 0) + itemsTotal(completeExtras);
    run(
      "complete",
      () =>
        completeBooking({
          bookingId,
          paymentMethod: asPayment(completePayment),
          extras: toItems(completeExtras),
        }),
      () => {
        setBookingId("");
        setCompletePayment("");
        setCompleteExtras([]);
        setMessage(`Atendimento concluído — ${formatBRL(total)}`);
      },
    );
  }

  function onWalkIn() {
    const total = itemsTotal(walkInItems);
    run(
      "walkin",
      () =>
        registerWalkIn({
          items: toItems(walkInItems),
          clientName: walkInClientName || undefined,
          paymentMethod: asPayment(walkInPayment),
        }),
      () => {
        setWalkInItems([emptyRow()]);
        setWalkInClientName("");
        setWalkInPayment("");
        setMessage(`Avulso registrado — ${formatBRL(total)}`);
      },
    );
  }

  function onExpense() {
    const total = Number(expenseAmount) || 0;
    run(
      "expense",
      () =>
        registerExpense({
          amount: Number(expenseAmount),
          description: expenseDescription,
          category: expenseCategory || undefined,
          paymentMethod: asPayment(expensePayment),
        }),
      () => {
        setExpenseAmount("");
        setExpenseDescription("");
        setExpenseCategory("");
        setExpensePayment("");
        setMessage(`Despesa registrada — ${formatBRL(total)}`);
      },
    );
  }

  function onDeactivate() {
    if (!lastEntryId) return;
    const entryId = lastEntryId;
    run(
      "deactivate",
      () => deactivateLedgerEntry({ ledgerEntryId: entryId }),
      () => {
        setLastEntryId(null);
        setMessage("Lançamento inativado (correção).");
      },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {message && (
        <p className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm font-medium">
          {message}
          {lastEntryId && (
            <button
              type="button"
              className="ml-3 rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              onClick={onDeactivate}
              disabled={isPending}
            >
              {busy === "deactivate" ? "Inativando..." : "Inativar (corrigir)"}
            </button>
          )}
        </p>
      )}

      {/* Concluir atendimento (US1 + extras US2) */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Concluir atendimento</h2>
        <select
          className="rounded border border-neutral-300 p-2 text-sm"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
        >
          <option value="">Selecione um atendimento ativo…</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {formatWhen(b.startsAtIso)} — {b.serviceName} ({b.clientLabel})
            </option>
          ))}
        </select>
        <PaymentSelect value={completePayment} onChange={setCompletePayment} />
        <ItemsEditor
          label="Extras (opcional)"
          rows={completeExtras}
          onChange={setCompleteExtras}
          services={services}
        />
        <button
          type="button"
          className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={onComplete}
          disabled={isPending}
        >
          {busy === "complete" ? "Concluindo..." : "Concluir e registrar receita"}
        </button>
      </section>

      {/* Atendimento avulso / walk-in (US3) */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Atendimento avulso (walk-in)</h2>
        <ItemsEditor
          label="Itens"
          rows={walkInItems}
          onChange={setWalkInItems}
          services={services}
        />
        <input
          className="rounded border border-neutral-300 p-2 text-sm"
          placeholder="Nome do cliente (opcional)"
          value={walkInClientName}
          onChange={(e) => setWalkInClientName(e.target.value)}
        />
        <PaymentSelect value={walkInPayment} onChange={setWalkInPayment} />
        <button
          type="button"
          className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={onWalkIn}
          disabled={isPending}
        >
          {busy === "walkin" ? "Registrando..." : "Registrar avulso"}
        </button>
      </section>

      {/* Despesa (US4) */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Despesa</h2>
        <input
          className="rounded border border-neutral-300 p-2 text-sm"
          placeholder="Descrição"
          value={expenseDescription}
          onChange={(e) => setExpenseDescription(e.target.value)}
        />
        <input
          className="rounded border border-neutral-300 p-2 text-sm"
          placeholder="Categoria (opcional)"
          value={expenseCategory}
          onChange={(e) => setExpenseCategory(e.target.value)}
        />
        <input
          className="rounded border border-neutral-300 p-2 text-sm"
          placeholder="Valor"
          inputMode="decimal"
          value={expenseAmount}
          onChange={(e) => setExpenseAmount(e.target.value)}
        />
        <PaymentSelect value={expensePayment} onChange={setExpensePayment} />
        <button
          type="button"
          className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={onExpense}
          disabled={isPending}
        >
          {busy === "expense" ? "Registrando..." : "Registrar despesa"}
        </button>
      </section>
    </div>
  );
}

function PaymentSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      className="rounded border border-neutral-300 p-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Forma de pagamento (opcional)</option>
      {PAYMENT_METHODS.map((pm) => (
        <option key={pm} value={pm}>
          {pm}
        </option>
      ))}
    </select>
  );
}

function ItemsEditor({
  label,
  rows,
  onChange,
  services,
}: {
  label: string;
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  services: ServiceOption[];
}) {
  function update(index: number, patch: Partial<ItemRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rows, emptyRow()]);
  }
  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-2">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-neutral-300 p-1 text-sm"
            value={row.serviceId}
            onChange={(e) => update(index, { serviceId: e.target.value })}
          >
            <option value="">Item manual</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (R$ {s.price})
              </option>
            ))}
          </select>
          {!row.serviceId && (
            <>
              <input
                className="rounded border border-neutral-300 p-1 text-sm"
                placeholder="Descrição"
                value={row.description}
                onChange={(e) => update(index, { description: e.target.value })}
              />
              <input
                className="w-24 rounded border border-neutral-300 p-1 text-sm"
                placeholder="Valor"
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => update(index, { amount: e.target.value })}
              />
            </>
          )}
          <button
            type="button"
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100"
            onClick={() => remove(index)}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
        onClick={add}
      >
        + Adicionar item
      </button>
    </div>
  );
}
