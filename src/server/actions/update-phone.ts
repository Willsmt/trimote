"use server";

import { requireUser } from "@/server/auth/session";
import { updatePhoneForUser, type UpdatePhoneResult } from "@/server/profile/update-phone";

/**
 * Server Action de atualização do telefone do próprio titular (issue #34). Exige sessão; o `userId`
 * vem SEMPRE da sessão (requireUser), NUNCA do input — o cliente só edita o próprio telefone (mesma
 * disciplina anti-IDOR do resto do app). Valida/normaliza no core antes de persistir.
 */
export async function updatePhone(input: { phone: string | null }): Promise<UpdatePhoneResult> {
  const user = await requireUser();
  return updatePhoneForUser({ userId: user.id, phone: input.phone });
}
