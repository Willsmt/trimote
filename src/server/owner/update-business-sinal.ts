import { prisma } from "@/server/db/client";

/**
 * Núcleo da atualização de sinal + chave PIX do Business, testável com `businessId` explícito — a
 * Server Action deriva o businessId de `requireOwner()` (nunca do input, anti-IDOR). Mesmo padrão de
 * `updateBusinessWhatsappForBusiness` (src/server/owner/update-business-whatsapp.ts).
 *
 * Ação ÚNICA que grava os dois campos juntos numa mesma chamada (decisão de produto: configurar um
 * sem o outro não faz sentido pro dono) — mas SEM obrigatoriedade de os dois virem preenchidos: cada
 * campo aceita `null` independentemente (sinal desligado / sem chave cadastrada ainda).
 *
 * sinalPercentual: `null` é o estado "desligado", válido sem validação. Fora disso, tem de ser
 * inteiro em [0, 100] — fora da faixa OU não-inteiro (ex.: 33.5) é recusado SEM gravar nada (nem o
 * chavePix desta mesma chamada), mesmo padrão "tudo ou nada" do restante do form.
 *
 * chavePix: mesma normalização de `updateBusinessWhatsappForBusiness` (trim; vazio/só espaço vira
 * `null`). Sem validação de formato: CPF/e-mail/telefone/aleatória têm formatos muito diferentes;
 * validar isso é escopo novo, fora desta feature.
 */

export interface UpdateBusinessSinalInput {
  businessId: string;
  /** null desliga o sinal. */
  sinalPercentual: number | null;
  /** null/vazio limpa a chave. */
  chavePix: string | null;
}

export type UpdateBusinessSinalResult =
  | { ok: true; sinalPercentual: number | null; chavePix: string | null }
  | { ok: false; reason: "invalid_percentual" };

export async function updateBusinessSinalForBusiness(
  input: UpdateBusinessSinalInput,
): Promise<UpdateBusinessSinalResult> {
  const { businessId, sinalPercentual, chavePix } = input;

  if (
    sinalPercentual !== null &&
    (!Number.isInteger(sinalPercentual) || sinalPercentual < 0 || sinalPercentual > 100)
  ) {
    return { ok: false, reason: "invalid_percentual" };
  }

  const normalizedChavePix = chavePix?.trim() ? chavePix.trim() : null;

  await prisma.business.update({
    where: { id: businessId },
    data: { sinalPercentual, chavePix: normalizedChavePix },
  });

  return { ok: true, sinalPercentual, chavePix: normalizedChavePix };
}
