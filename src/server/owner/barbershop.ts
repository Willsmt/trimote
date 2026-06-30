import { prisma } from "@/server/db/client";

/**
 * Resolve a (única) barbearia do MVP. O painel gerencia o catálogo/expediente dessa barbearia.
 * O modelo de role já abre caminho para multi-barbearia futura sem reescrever a autorização.
 */
export async function getOwnerBarbershopId(): Promise<string> {
  const barbershop = await prisma.barbershop.findFirstOrThrow({ select: { id: true } });
  return barbershop.id;
}
