"use server";

import { cookies } from "next/headers";

import { getCurrentUser, UnauthorizedError } from "@/server/auth/session";
import {
  switchActiveBusiness,
  type SwitchBusinessResult,
} from "@/server/business/switch-business";

/**
 * Server Action da troca de negócio ativo (007, US2). Exige sessão; deriva o `userId` da sessão e o
 * `sessionToken` do cookie (o negócio ativo é estado da SESSÃO, server-side). Valida membership no
 * core. O `businessId` do input é apenas o ALVO da troca — só efetiva se o usuário for membro.
 */
export async function switchBusiness(input: {
  businessId: string;
}): Promise<SwitchBusinessResult | { ok: false; reason: "no_session" }> {
  const user = await getCurrentUser();
  if (!user?.id) throw new UnauthorizedError();

  const store = await cookies();
  const token =
    store.get("next-auth.session-token")?.value ??
    store.get("__Secure-next-auth.session-token")?.value;
  if (!token) return { ok: false, reason: "no_session" };

  return switchActiveBusiness({ userId: user.id, sessionToken: token, businessId: input.businessId });
}
