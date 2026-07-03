"use server";

import { prisma } from "@/server/db/client";

/**
 * Server Action: lista os serviços oferecidos (FR-002). Pública — não exige autenticação.
 * O preço é serializado como string (Decimal não é serializável para o client); a formatação de
 * moeda ocorre na camada de UI.
 */
export interface ServiceListItem {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
}

export async function listServices(): Promise<ServiceListItem[]> {
  const services = await prisma.service.findMany({
    // Feature 002: a oferta pública mostra apenas serviços ativos (FR-006).
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, price: true, durationMinutes: true },
  });

  return services.map((service) => ({
    id: service.id,
    name: service.name,
    price: service.price.toString(),
    durationMinutes: service.durationMinutes,
  }));
}
