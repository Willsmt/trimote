import { redirect } from "next/navigation";

import { requireUser, UnauthorizedError } from "@/server/auth/session";
import { listClientHistory } from "@/server/ledger/client-history";
import { MySpendingList } from "@/components/client/my-spending-list";
import type { ClientHistoryPageDTO } from "@/server/actions/list-my-ledger";

export const dynamic = "force-dynamic";

// Histórico dos próprios gastos (006, US5). Exige apenas sessão autenticada (qualquer papel); o
// filtro por clientId é SEMPRE o usuário da sessão, no servidor (FR-019/FR-021).
export default async function MySpendingPage() {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/api/auth/signin?callbackUrl=/my-spending");
    throw error;
  }

  const first = await listClientHistory({ userId });

  const initialPage: ClientHistoryPageDTO = {
    rows: first.rows.map((r) => ({
      id: r.id,
      occurredAtIso: r.occurredAt.toISOString(),
      description: r.description,
      amount: r.amount.toString(),
      businessName: r.businessName,
      items: r.items.map((it) => ({ description: it.description, amount: it.amount.toString() })),
    })),
    nextCursor: first.nextCursor
      ? { occurredAtIso: first.nextCursor.occurredAt.toISOString(), id: first.nextCursor.id }
      : null,
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Meus gastos</h1>
        <p className="text-sm text-neutral-500">Histórico dos seus atendimentos na barbearia.</p>
      </header>
      <MySpendingList initialPage={initialPage} />
    </main>
  );
}
