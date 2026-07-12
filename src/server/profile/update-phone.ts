import { prisma } from "@/server/db/client";
import { normalizePhoneBR } from "@/domain/phone";

/**
 * Núcleo da atualização de telefone do próprio titular (issue #34), testável com `userId` explícito —
 * a action deriva o userId da SESSÃO (nunca do input, anti-IDOR). Normaliza para E.164 ANTES de
 * persistir: o banco guarda a forma canônica, não o que o cliente digitou. Vazio/branco limpa (null).
 */

export interface UpdatePhoneInput {
  userId: string;
  /** Telefone digitado (com máscara ou não); null/vazio limpa o campo. */
  phone: string | null;
}

export type UpdatePhoneResult =
  | { ok: true; phone: string | null }
  | { ok: false; reason: "invalid_phone" };

export async function updatePhoneForUser(input: UpdatePhoneInput): Promise<UpdatePhoneResult> {
  // Limpar o telefone: null, vazio ou só espaços removem (opcional é opcional — o titular pode apagar).
  const raw = input.phone?.trim() ?? "";
  if (raw === "") {
    await prisma.user.update({ where: { id: input.userId }, data: { phone: null } });
    return { ok: true, phone: null };
  }

  // Autoritativo no servidor: valida + normaliza. `null` do domínio (telefone inválido) vira a recusa
  // de negócio; nada é persistido.
  const normalized = normalizePhoneBR(raw);
  if (normalized === null) {
    return { ok: false, reason: "invalid_phone" };
  }

  await prisma.user.update({ where: { id: input.userId }, data: { phone: normalized } });
  return { ok: true, phone: normalized };
}
