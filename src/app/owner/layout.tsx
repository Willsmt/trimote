import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { readActiveBusinessHint, resolveActiveBusiness } from "@/server/business/active-business";
import { BusinessSwitcher } from "@/components/owner/business-switcher";

export const dynamic = "force-dynamic";

/**
 * Layout compartilhado das rotas de dono (007, US2 — fix do smoke T044/BUG 1). O BusinessSwitcher era
 * exclusivo de /owner/finance; trocar de negócio fora dali exigia ir ao Financeiro ou relogar. Aqui o
 * seletor passa a ser CHROME de toda a área de dono — uma única fonte, sem duplicar por página.
 *
 * NÃO é barreira de autorização (isso é requireOwner em cada página/action). É só conveniência de UI,
 * então é resiliente: sem sessão ou sem negócio ativo → apenas os filhos. O switcher aparece só no
 * estado 'active' (com 1 vínculo ele já se oculta sozinho); em needs_selection a própria página
 * renderiza a tela de seleção — o layout não duplica o seletor. Em 'empty' a página redireciona.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.id) return <>{children}</>;

  const hint = await readActiveBusinessHint();
  const active = await resolveActiveBusiness(user.id, hint);
  if (active.state !== "active") return <>{children}</>;

  // Lista completa dos negócios do dono para o seletor (o estado 'active' só devolve o ativo).
  const memberships = await prisma.businessMember.findMany({
    where: { userId: user.id, role: "OWNER" },
    select: { business: { select: { id: true, name: true } } },
    orderBy: { business: { name: "asc" } },
  });
  const businesses = memberships.map((m) => m.business);

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-8 pt-6">
        <BusinessSwitcher businesses={businesses} activeBusinessId={active.businessId} />
      </div>
      {children}
    </>
  );
}
