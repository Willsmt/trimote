import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOwner, ForbiddenError, NeedsBusinessSelectionError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { getCashSummaryForOwner } from "@/server/ledger/cash-summary";
import { listLedgerForOwner } from "@/server/ledger/ledger-list";
import { todayInZone, shiftPeriod, type Granularity } from "@/domain/time";
import { CashSummaryView } from "@/components/owner/cash-summary-view";
import { LedgerBrowser } from "@/components/owner/ledger-browser";
import { BusinessSwitcher } from "@/components/owner/business-switcher";
import { BusinessSelectionScreen } from "@/components/owner/business-selection-screen";
import type { LedgerPageDTO } from "@/server/actions/list-ledger";

export const dynamic = "force-dynamic";

const GRANULARITIES: Granularity[] = ["day", "week", "month", "year"];
const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  year: "Ano",
};

function parseGranularity(value: string | undefined): Granularity {
  return (GRANULARITIES as string[]).includes(value ?? "") ? (value as Granularity) : "month";
}

// Valida 'YYYY-MM-DD'; qualquer coisa fora do formato cai no default (mês corrente no fuso da loja).
function parseReference(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function periodLabel(startUtc: Date, granularity: Granularity, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions =
    granularity === "year"
      ? { year: "numeric" }
      : granularity === "month"
        ? { month: "long", year: "numeric" }
        : { day: "2-digit", month: "2-digit", year: "numeric" };
  const label = new Intl.DateTimeFormat("pt-BR", { timeZone, ...opts }).format(startUtc);
  return granularity === "week" ? `Semana de ${label}` : label;
}

export default async function OwnerFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; d?: string }>;
}) {
  let businessId: string;
  let timeZone: string;
  let userId: string;
  try {
    const owner = await requireOwner();
    businessId = owner.businessId;
    timeZone = owner.timeZone;
    userId = owner.user.id;
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/api/auth/signin?callbackUrl=/owner/finance");
    // needs_selection é ESTADO DE UI (dono de 2+ negócios sem ativo): renderiza o seletor, não explode.
    if (error instanceof NeedsBusinessSelectionError) return <BusinessSelectionScreen options={error.options} />;
    if (error instanceof ForbiddenError) redirect("/");
    throw error;
  }

  // Seletor de negócio ativo (US2): lista os negócios do dono (oculto se 1).
  const memberships = await prisma.businessMember.findMany({
    where: { userId, role: "OWNER" },
    select: { business: { select: { id: true, name: true } } },
    orderBy: { business: { name: "asc" } },
  });
  const ownerBusinesses = memberships.map((m) => m.business);

  const sp = await searchParams;
  const granularity = parseGranularity(sp.g);
  const referenceLocalDate = parseReference(sp.d, todayInZone(new Date(), timeZone));

  const period = { granularity, referenceLocalDate };

  const [summary, ledgerFirst] = await Promise.all([
    getCashSummaryForOwner({ businessId, timeZone, granularity, referenceLocalDate }),
    listLedgerForOwner({ businessId, timeZone, filter: { period } }),
  ]);

  // Serializa a 1ª página do razão para a ilha (Decimal→string, datas→ISO — D5).
  const initialLedgerPage: LedgerPageDTO = {
    rows: ledgerFirst.rows.map((r) => ({
      id: r.id,
      occurredAtIso: r.occurredAt.toISOString(),
      type: r.type,
      origin: r.origin,
      description: r.description,
      paymentMethod: r.paymentMethod,
      amount: r.amount.toString(),
      isActive: r.isActive,
      items: r.items.map((it) => ({ description: it.description, amount: it.amount.toString() })),
    })),
    nextCursor: ledgerFirst.nextCursor
      ? { occurredAtIso: ledgerFirst.nextCursor.occurredAt.toISOString(), id: ledgerFirst.nextCursor.id }
      : null,
  };

  const prev = shiftPeriod(referenceLocalDate, granularity, -1);
  const next = shiftPeriod(referenceLocalDate, granularity, 1);
  const href = (g: Granularity, d: string) => `/owner/finance?g=${g}&d=${d}`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BusinessSwitcher businesses={ownerBusinesses} activeBusinessId={businessId} />
      <header>
        <h1 className="text-2xl font-bold">Balancete</h1>
        <p className="text-sm text-neutral-500">Caixa da barbearia por período (entradas, saídas e saldo).</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {GRANULARITIES.map((g) => (
            <Link
              key={g}
              href={href(g, referenceLocalDate)}
              className={`rounded-md border px-3 py-1 text-sm ${
                g === granularity ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200"
              }`}
            >
              {GRANULARITY_LABELS[g]}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(granularity, prev)} className="rounded-md border border-neutral-200 px-3 py-1 text-sm">
            ← Anterior
          </Link>
          <span className="min-w-[10rem] text-center text-sm font-medium">
            {periodLabel(summary.period.startUtc, granularity, timeZone)}
          </span>
          <Link href={href(granularity, next)} className="rounded-md border border-neutral-200 px-3 py-1 text-sm">
            Próximo →
          </Link>
        </div>
      </div>

      <CashSummaryView
        income={summary.income.toString()}
        expense={summary.expense.toString()}
        balance={summary.balance.toString()}
        incomeByPaymentMethod={summary.incomeByPaymentMethod.map((b) => ({ key: b.key, amount: b.amount.toString() }))}
        expenseByCategory={summary.expenseByCategory.map((b) => ({ key: b.key, amount: b.amount.toString() }))}
      />

      <LedgerBrowser initialPage={initialLedgerPage} period={period} />
    </main>
  );
}
