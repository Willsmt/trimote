"use server";

import { requireOwner } from "@/server/auth/owner";
import {
  updateBusinessEnderecoForBusiness,
  type UpdateBusinessEnderecoResult,
} from "@/server/owner/update-business-endereco";

/**
 * Server Action de atualização do endereço do negócio (issue #54). Exige dono do negócio ATIVO; o
 * `businessId` vem SEMPRE de `requireOwner()`, NUNCA do input (mesma disciplina anti-IDOR de
 * `update-business-whatsapp.ts`).
 */
export async function updateBusinessEndereco(input: {
  endereco: string | null;
}): Promise<UpdateBusinessEnderecoResult> {
  const { businessId } = await requireOwner();
  return updateBusinessEnderecoForBusiness({ businessId, endereco: input.endereco });
}
