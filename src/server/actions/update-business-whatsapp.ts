"use server";

import { requireOwner } from "@/server/auth/owner";
import {
  updateBusinessWhatsappForBusiness,
  type UpdateBusinessWhatsappResult,
} from "@/server/owner/update-business-whatsapp";

/**
 * Server Action de atualização do WhatsApp do negócio (issue #52). Exige dono do negócio ATIVO; o
 * `businessId` vem SEMPRE de `requireOwner()`, NUNCA do input (mesma disciplina anti-IDOR do resto
 * do painel — o cliente não escolhe em qual negócio a escrita cai).
 */
export async function updateBusinessWhatsapp(input: {
  whatsapp: string | null;
}): Promise<UpdateBusinessWhatsappResult> {
  const { businessId } = await requireOwner();
  return updateBusinessWhatsappForBusiness({ businessId, whatsapp: input.whatsapp });
}
