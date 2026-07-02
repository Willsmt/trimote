"use client";

import { useState, useTransition } from "react";

import { listLedger, type LedgerPageDTO, type LedgerRowDTO } from "@/server/actions/list-ledger";
import type { Granularity } from "@/domain/time";

// Ilha client do razão (006, US3): filtros combináveis, "carregar mais" (keyset via nextCursor),
// expansão de itens client-side e sinal visual do valor pelo tipo. O período vem do caixa (mesma
// tela) para manter caixa e razão coerentes; os demais filtros são locais.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  CARD: "Cartão",
  ONLINE: "Online",
  OTHER: "Outro",
};
const ORIGIN_LABELS: Record<string, string> = {
  BOOKING: "Agendamento",
  WALK_IN: "Avulso",
  EXPENSE: "Despesa",
};

interface LocalFilter {
  type?: "INCOME" | "EXPENSE";
  origin?: "BOOKING" | "WALK_IN" | "EXPENSE";
  paymentMethod?: "CASH" | "PIX" | "CARD" | "ONLINE" | "OTHER" | "UNSET";
  category?: string;
  includeInactive?: boolean;
}

export interface LedgerBrowserProps {
  initialPage: LedgerPageDTO;
  period: { granularity: Granularity; referenceLocalDate: string };
}

function signed(row: LedgerRowDTO): string {
  const value = BRL.format(Number(row.amount));
  return row.type === "INCOME" ? `+ ${value}` : `- ${value}`;
}

export function LedgerBrowser({ initialPage, period }: LedgerBrowserProps) {
  const [rows, setRows] = useState<LedgerRowDTO[]>(initialPage.rows);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [filter, setFilter] = useState<LocalFilter>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toBackendFilter(f: LocalFilter) {
    return {
      period,
      type: f.type,
      origin: f.origin,
      paymentMethod: f.paymentMethod,
      category: f.category?.trim() ? f.category.trim() : undefined,
      includeInactive: f.includeInactive,
    };
  }

  function applyFilter(next: LocalFilter) {
    setFilter(next);
    startTransition(async () => {
      const page = await listLedger({ filter: toBackendFilter(next) });
      setRows(page.rows);
      setCursor(page.nextCursor);
    });
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await listLedger({ filter: toBackendFilter(filter), cursor });
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    });
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-neutral-700">Lançamentos do período</h2>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          className="rounded-md border border-neutral-200 px-2 py-1"
          value={filter.type ?? ""}
          onChange={(e) => applyFilter({ ...filter, type: (e.target.value || undefined) as LocalFilter["type"] })}
        >
          <option value="">Tipo: todos</option>
          <option value="INCOME">Entradas</option>
          <option value="EXPENSE">Saídas</option>
        </select>
        <select
          className="rounded-md border border-neutral-200 px-2 py-1"
          value={filter.origin ?? ""}
          onChange={(e) => applyFilter({ ...filter, origin: (e.target.value || undefined) as LocalFilter["origin"] })}
        >
          <option value="">Origem: todas</option>
          <option value="BOOKING">Agendamento</option>
          <option value="WALK_IN">Avulso</option>
          <option value="EXPENSE">Despesa</option>
        </select>
        <select
          className="rounded-md border border-neutral-200 px-2 py-1"
          value={filter.paymentMethod ?? ""}
          onChange={(e) => applyFilter({ ...filter, paymentMethod: (e.target.value || undefined) as LocalFilter["paymentMethod"] })}
        >
          <option value="">Forma: todas</option>
          <option value="CASH">Dinheiro</option>
          <option value="PIX">Pix</option>
          <option value="CARD">Cartão</option>
          <option value="ONLINE">Online</option>
          <option value="OTHER">Outro</option>
          <option value="UNSET">Não informado</option>
        </select>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={filter.includeInactive ?? false}
            onChange={(e) => applyFilter({ ...filter, includeInactive: e.target.checked })}
          />
          Mostrar inativos
        </label>
      </div>

      <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {rows.length === 0 ? (
          <li className="p-3 text-sm text-neutral-400">Nenhum lançamento.</li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className={`p-3 text-sm ${row.isActive ? "" : "bg-neutral-50 text-neutral-400"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {row.description}
                    {!row.isActive && <span className="ml-2 text-xs uppercase">(inativo)</span>}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {new Date(row.occurredAtIso).toLocaleString("pt-BR")} · {ORIGIN_LABELS[row.origin]}
                    {row.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[row.paymentMethod]}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`tabular-nums font-semibold ${row.type === "INCOME" ? "text-emerald-600" : "text-red-600"}`}>
                    {signed(row)}
                  </span>
                  {row.items.length > 0 && (
                    <button type="button" className="text-xs text-neutral-500 underline" onClick={() => toggle(row.id)}>
                      {expanded.has(row.id) ? "ocultar" : "itens"}
                    </button>
                  )}
                </div>
              </div>
              {expanded.has(row.id) && row.items.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 pl-4 text-xs text-neutral-500">
                  {row.items.map((it, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{it.description}</span>
                      <span className="tabular-nums">{BRL.format(Number(it.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))
        )}
      </ul>

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="self-center rounded-md border border-neutral-200 px-4 py-1 text-sm disabled:opacity-50"
        >
          {pending ? "Carregando…" : "Carregar mais"}
        </button>
      )}
    </section>
  );
}
