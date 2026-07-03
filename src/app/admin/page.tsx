import { redirect } from "next/navigation";

import { requireAdmin } from "@/server/auth/admin";
import { ForbiddenError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { CreateBusinessForm } from "@/components/admin/create-business-form";
import { PromoteOwnerForm } from "@/components/admin/promote-owner-form";

export const dynamic = "force-dynamic";

// Área ADMIN (007, US1): criar negócios e promover donos. Barreira no servidor (requireAdmin);
// visitante → login, não-ADMIN → home. Sem self-service (nenhuma ação eleva a ADMIN).
export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/api/auth/signin?callbackUrl=/admin");
    if (error instanceof ForbiddenError) redirect("/");
    throw error;
  }

  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, _count: { select: { members: true } } },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Administração da plataforma</h1>
        <p className="text-sm text-neutral-500">Criar negócios e vincular donos. Ações auditadas.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CreateBusinessForm />
        <PromoteOwnerForm businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Negócios</h2>
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 text-sm">
          {businesses.length === 0 ? (
            <li className="p-3 text-neutral-400">Nenhum negócio ainda.</li>
          ) : (
            businesses.map((b) => (
              <li key={b.id} className="flex items-center justify-between p-3">
                <span className="font-medium">{b.name}</span>
                <span className="text-neutral-500">/b/{b.slug} · {b._count.members} dono(s)</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
