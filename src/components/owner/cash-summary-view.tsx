import { formatBRL } from "@/domain/money";

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
        <div className="rounded-card border border-borda bg-superficie p-6">
          <p className="text-sm text-texto-secundario">Entradas</p>
          <p className="text-xl font-semibold text-sucesso-texto">{formatBRL(Number(income))}</p>
        </div>
        <div className="rounded-card border border-borda bg-superficie p-6">
          <p className="text-sm text-texto-secundario">Saídas</p>
          <p className="text-xl font-semibold text-carmesim-texto">{formatBRL(Number(expense))}</p>
        </div>
        <div className="rounded-card border border-borda bg-superficie p-6">
          <p className="text-sm text-texto-secundario">Saldo</p>
          <p className={`text-xl font-semibold ${negative ? "text-carmesim-texto" : "text-texto"}`}>
            {formatBRL(Number(balance))}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-texto">Entradas por forma de pagamento</h2>
          {incomeByPaymentMethod.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sem entradas no período.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {incomeByPaymentMethod.map((b) => (
                <li key={b.key ?? "UNSET"} className="flex justify-between text-sm">
                  <span>{PAYMENT_METHOD_LABELS[b.key ?? "UNSET"] ?? b.key}</span>
                  <span className="tabular-nums">{formatBRL(Number(b.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-texto">Saídas por categoria</h2>
          {expenseByCategory.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sem saídas no período.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {expenseByCategory.map((b) => (
                <li key={b.key ?? "__sem_categoria__"} className="flex justify-between text-sm">
                  <span>{b.key ?? "Sem categoria"}</span>
                  <span className="tabular-nums">{formatBRL(Number(b.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
