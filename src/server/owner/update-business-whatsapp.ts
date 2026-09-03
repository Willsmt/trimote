import { prisma } from "@/server/db/client";
import { normalizePhoneBR } from "@/domain/phone";

/**
 * Núcleo da atualização do WhatsApp do Business (issue #52, primeira mutação em Business via
 * código), testável com `businessId` explícito — a Server Action deriva o businessId de
 * `requireOwner()` (nunca do input, anti-IDOR). Mesma disciplina de `updatePhoneForUser`
 * (src/server/profile/update-phone.ts): normaliza para E.164 ANTES de persistir; vazio/branco limpa
 * (null) sem passar pela validação.
 */

export interface UpdateBusinessWhatsappInput {
  businessId: string;
  /** Celular digitado (com máscara ou não); null/vazio limpa o campo. */
  whatsapp: string | null;
}

export type UpdateBusinessWhatsappResult =
  | { ok: true; whatsapp: string | null }
  | { ok: false; reason: "invalid_phone" };

export async function updateBusinessWhatsappForBusiness(
  input: UpdateBusinessWhatsappInput,
): Promise<UpdateBusinessWhatsappResult> {
  const raw = input.whatsapp?.trim() ?? "";
  if (raw === "") {
    await prisma.business.update({ where: { id: input.businessId }, data: { whatsapp: null } });
    return { ok: true, whatsapp: null };
  }

  // Autoritativo no servidor: normaliza (mesma regra de celular BR do WhatsApp do usuário, #34).
  // `null` do domínio (inválido) vira a recusa de negócio; nada é persistido.
  const normalized = normalizePhoneBR(raw);
  if (normalized === null) {
    return { ok: false, reason: "invalid_phone" };
  }

  await prisma.business.update({ where: { id: input.businessId }, data: { whatsapp: normalized } });
  return { ok: true, whatsapp: normalized };
}
