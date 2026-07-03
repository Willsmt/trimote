import { prisma } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Resolução do NEGÓCIO ATIVO do dono (007, US2/US3). É estado server-side: a fonte de verdade da
 * posse é `BusinessMember`; o negócio ativo é revalidado por request (nunca vem do input — anti-IDOR,
 * FR-014). `resolveActiveBusiness` é puro (testável): recebe o `userId` e o `activeBusinessId` (hint
 * lido da sessão) e devolve o estado. 0 vínculos → empty; 1 → auto; N com hint válido → active; N sem
 * hint válido → needs_selection.
 */

export type ActiveBusiness =
  | { state: "active"; businessId: string; timeZone: string; name: string }
  | { state: "needs_selection"; options: { businessId: string; name: string }[] }
  | { state: "empty" };

export async function resolveActiveBusiness(
  userId: string,
  activeBusinessId: string | null,
): Promise<ActiveBusiness> {
  const memberships = await prisma.businessMember.findMany({
    where: { userId, role: "OWNER" },
    select: { business: { select: { id: true, name: true, timezone: true } } },
    orderBy: { business: { name: "asc" } },
  });
  const businesses = memberships.map((m) => m.business);

  if (businesses.length === 0) return { state: "empty" };
  if (businesses.length === 1) {
    const b = businesses[0];
    return { state: "active", businessId: b.id, timeZone: b.timezone, name: b.name };
  }
  // N vínculos: só aceita o hint se o usuário for MEMBRO daquele negócio (revalidação — anti-IDOR).
  const chosen = activeBusinessId ? businesses.find((b) => b.id === activeBusinessId) : undefined;
  if (chosen) return { state: "active", businessId: chosen.id, timeZone: chosen.timezone, name: chosen.name };
  return { state: "needs_selection", options: businesses.map((b) => ({ businessId: b.id, name: b.name })) };
}

/** Lê o `activeBusinessId` da SESSÃO (via cookie de sessão). Tolerante fora de request (tests) → null. */
export async function readActiveBusinessHint(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const token =
      store.get("next-auth.session-token")?.value ??
      store.get("__Secure-next-auth.session-token")?.value;
    if (!token) return null;
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      select: { activeBusinessId: true },
    });
    return session?.activeBusinessId ?? null;
  } catch {
    return null;
  }
}

/** Negócio ativo do usuário da sessão (server). Usado pelas páginas de dono e por requireOwner. */
export async function getActiveBusiness(): Promise<ActiveBusiness> {
  const user = await getCurrentUser();
  if (!user?.id) return { state: "empty" };
  const hint = await readActiveBusinessHint();
  return resolveActiveBusiness(user.id, hint);
}
