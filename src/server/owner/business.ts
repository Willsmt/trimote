import { prisma } from "@/server/db/client";

/**
 * Resolve a (única) barbearia do MVP. O painel gerencia o catálogo/expediente dessa barbearia.
 * O modelo de role já abre caminho para multi-barbearia futura sem reescrever a autorização.
 */
export async function getOwnerBusinessId(): Promise<string> {
  const business = await prisma.business.findFirstOrThrow({ select: { id: true } });
  return business.id;
}
