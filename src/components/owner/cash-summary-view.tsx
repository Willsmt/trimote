// Componente de LEITURA (server-friendly, sem estado) do caixa + breakdown (006, US1/US2). Recebe os
// valores já serializados como string (Decimal→string na fronteira Server/Client) e aplica os rótulos
// pt-BR. Sem gráficos (FR-026): só números e tabelas.

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  CARD: "Cartão",
  ONLINE: "Online",
  OTHER: "Outro",
  UNSET: "Não informado",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function money(value: string): string {
  return BRL.format(Number(value));
}

interface Bucket {
  key: string | null;
  amount: string;
}

export interface CashSummaryViewProps {
  income: string;
  expense: string;
  balance: string;
  incomeByPaymentMethod: Bucket[];
  expenseByCategory: Bucket[];
}

export function CashSummaryView({
  income,
  expense,
  balance,
  incomeByPaymentMethod,
  expenseByCategory,
}: CashSummaryViewProps) {
  const negative = balance.trim().startsWith("-");

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Entradas</p>
          <p className="text-xl font-semibold text-emerald-600">{money(income)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Saídas</p>
          <p className="text-xl font-semibold text-red-600">{money(expense)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">Saldo</p>
          <p className={`text-xl font-semibold ${negative ? "text-red-600" : "text-neutral-900"}`}>
            {money(balance)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Entradas por forma de pagamento</h2>
          {incomeByPaymentMethod.length === 0 ? (
            <p className="text-sm text-neutral-400">Sem entradas no período.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {incomeByPaymentMethod.map((b) => (
                <li key={b.key ?? "UNSET"} className="flex justify-between text-sm">
                  <span>{PAYMENT_METHOD_LABELS[b.key ?? "UNSET"] ?? b.key}</span>
                  <span className="tabular-nums">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Saídas por categoria</h2>
          {expenseByCategory.length === 0 ? (
            <p className="text-sm text-neutral-400">Sem saídas no período.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {expenseByCategory.map((b) => (
                <li key={b.key ?? "__sem_categoria__"} className="flex justify-between text-sm">
                  <span>{b.key ?? "Sem categoria"}</span>
                  <span className="tabular-nums">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
