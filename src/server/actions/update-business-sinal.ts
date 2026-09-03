"use server";

import { requireOwner } from "@/server/auth/owner";
import {
  updateBusinessSinalForBusiness,
  type UpdateBusinessSinalResult,
} from "@/server/owner/update-business-sinal";

/**
 * Server Action de atualização de sinal + chave PIX do negócio. Exige dono do negócio ATIVO; o
 * `businessId` vem SEMPRE de `requireOwner()`, NUNCA do input (mesma disciplina anti-IDOR de
 * `update-business-whatsapp.ts`).
 */
export async function updateBusinessSinal(input: {
  sinalPercentual: number | null;
  chavePix: string | null;
}): Promise<UpdateBusinessSinalResult> {
  const { businessId } = await requireOwner();
  return updateBusinessSinalForBusiness({
    businessId,
    sinalPercentual: input.sinalPercentual,
    chavePix: input.chavePix,
  });
}
