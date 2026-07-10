"use client";

import { useState, useTransition } from "react";

import { listMyLedger, type ClientHistoryPageDTO } from "@/server/actions/list-my-ledger";

// Ilha client do histórico do próprio cliente (006, US5): exibe momento, descrição/itens e valor,
// com "carregar mais" via keyset (nextCursor). Só receitas do cliente — sem sinal de despesa.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Total das linhas EXIBIDAS (polish): somado no client a partir do que já foi carregado — nenhuma
// query nova. Em centavos (inteiros) para não acumular erro de float; valores vêm com 2 casas.
function sumDisplayed(rows: { amount: string }[]): number {
  return rows.reduce((cents, row) => cents + Math.round(Number(row.amount) * 100), 0) / 100;
}

export function MySpendingList({ initialPage }: { initialPage: ClientHistoryPageDTO }) {
  const [rows, setRows] = useState(initialPage.rows);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await listMyLedger({ cursor });
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">Você ainda não tem gastos registrados.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Padrão visual das somas do balancete (cash-summary-view). O rótulo é honesto sobre a
          cobertura: enquanto houver páginas por carregar, a soma cobre só o que está na tela. */}
      <div className="rounded-lg border border-neutral-200 p-4">
        <p className="text-sm text-neutral-500">{cursor ? "Total carregado até aqui" : "Total"}</p>
        <p className="text-xl font-semibold text-neutral-900 tabular-nums">
          {BRL.format(sumDisplayed(rows))}
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{row.description}</span>
              <span className="tabular-nums font-semibold">{BRL.format(Number(row.amount))}</span>
            </div>
            <span className="text-xs text-neutral-500">
              {new Date(row.occurredAtIso).toLocaleString("pt-BR")} · {row.businessName}
            </span>
            {row.items.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1 pl-4 text-xs text-neutral-500">
                {row.items.map((it, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{it.description}</span>
                    <span className="tabular-nums">{BRL.format(Number(it.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
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
