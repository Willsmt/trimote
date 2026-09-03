import { prisma } from "@/server/db/client";

/**
 * Núcleo da atualização do endereço do Business (issue #54), testável com `businessId` explícito —
 * a Server Action deriva o businessId de `requireOwner()` (nunca do input, anti-IDOR). Mesmo padrão
 * de `updateBusinessWhatsappForBusiness` (src/server/owner/update-business-whatsapp.ts).
 *
 * Distinção entre "limpar" e "inválido": `null`/`undefined`/string vazia (`""`) são o sinal EXPLÍCITO
 * de limpar (mesmo padrão do botão "Remover" do form, que manda `""` de propósito) — não passam por
 * validação. Uma string que só vira vazia DEPOIS do trim (ex.: só espaços) não é um "limpar"
 * intencional; é entrada inválida (reason: "invalid_input"), mesmo nível de rigor de `validateName`
 * em src/server/owner/services.ts — sem regex de formato, sem limite de tamanho artificial.
 */

export interface UpdateBusinessEnderecoInput {
  businessId: string;
  endereco: string | null;
}

export type UpdateBusinessEnderecoResult =
  | { ok: true; endereco: string | null }
  | { ok: false; reason: "invalid_input" };

export async function updateBusinessEnderecoForBusiness(
  input: UpdateBusinessEnderecoInput,
): Promise<UpdateBusinessEnderecoResult> {
  const { businessId, endereco } = input;

  if (endereco === null || endereco === undefined || endereco === "") {
    await prisma.business.update({ where: { id: businessId }, data: { endereco: null } });
    return { ok: true, endereco: null };
  }

  const trimmed = endereco.trim();
  if (trimmed === "") {
    return { ok: false, reason: "invalid_input" };
  }

  await prisma.business.update({ where: { id: businessId }, data: { endereco: trimmed } });
  return { ok: true, endereco: trimmed };
}
