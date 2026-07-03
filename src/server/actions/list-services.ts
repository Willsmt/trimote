"use server";

import { prisma } from "@/server/db/client";

/**
 * Lista os serviços ATIVOS de UM negócio (007, US4). Escopada por `businessId` (o negócio vem do slug
 * da página pública `/b/[slug]`) — nunca global, para não vazar catálogo entre negócios (R2). O preço
 * é serializado como string (Decimal não serializa para o client).
 */
export interface ServiceListItem {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
}

export async function listServicesForBusiness(businessId: string): Promise<ServiceListItem[]> {
  const services = await prisma.service.findMany({
    where: { businessId, isActive: true },
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
