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
    return <p className="text-sm text-texto-secundario">Você ainda não tem gastos registrados.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Padrão visual das somas do balancete (cash-summary-view). O rótulo é honesto sobre a
          cobertura: enquanto houver páginas por carregar, a soma cobre só o que está na tela. */}
      <div className="rounded-card border border-borda bg-superficie p-6">
        <p className="text-sm text-texto-secundario">{cursor ? "Total carregado até aqui" : "Total"}</p>
        <p className="text-xl font-semibold text-texto tabular-nums">
          {BRL.format(sumDisplayed(rows))}
        </p>
        {cursor && (
          <p className="text-xs text-texto-secundario">
            Para ver o total completo, carregue todos os gastos.
          </p>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-borda rounded-card border border-borda bg-superficie">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-texto">{row.description}</span>
              <span className="tabular-nums font-semibold">{BRL.format(Number(row.amount))}</span>
            </div>
            <span className="text-xs text-texto-secundario">
              {new Date(row.occurredAtIso).toLocaleString("pt-BR")} · {row.businessName}
            </span>
            {row.items.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1 pl-4 text-xs text-texto-secundario">
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
          className="self-center rounded-botao border border-borda px-4 py-1 text-sm text-texto transition-colors hover:border-primaria hover:text-primaria disabled:opacity-50"
        >
          {pending ? "Carregando…" : "Carregar mais"}
        </button>
      )}
    </section>
  );
}
