import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";

/**
 * Core de gestão de serviços (US1). Testável de forma isolada; as Server Actions são wrappers que
 * chamam `requireOwner` antes de delegar aqui.
 *
 * A unicidade de nome entre serviços ativos é garantida pelo **índice único parcial** no banco
 * (`barbershopservice_active_name_key`, WHERE isActive=true). Este core valida a entrada e traduz a
 * violação do índice em uma recusa de negócio `name_taken` — não reimplementa a unicidade na app.
 */

export type ServiceFailureReason = "invalid_input" | "not_found" | "name_taken" | "already_inactive";

export type ServiceMutationResult = { ok: true } | { ok: false; reason: ServiceFailureReason };
export type CreateServiceResult =
  | { ok: true; serviceId: string }
  | { ok: false; reason: ServiceFailureReason };

export interface CreateServiceInput {
  barbershopId: string;
  name: string;
  price: string; // decimal em string (nunca float)
  durationMinutes: number;
}

export interface UpdateServiceInput {
  serviceId: string;
  name?: string;
  price?: string;
  durationMinutes?: number;
}

/** Detecta a violação do índice único parcial de nome entre ativos (Postgres SQLSTATE 23505). */
function isActiveNameConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const text = `${error.code} ${error.message} ${JSON.stringify(error.meta ?? {})}`;
    return text.includes("barbershopservice_active_name_key") || text.includes("23505") || error.code === "P2002";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return error.message.includes("barbershopservice_active_name_key") || error.message.includes("23505");
  }
  return false;
}

function validateName(name: string | undefined): string | null {
  if (name === undefined) return null;
  return name.trim().length > 0 ? name.trim() : "invalid";
}

function validatePrice(price: string | undefined): Prisma.Decimal | null | "invalid" {
  if (price === undefined) return null;
  try {
    const decimal = new Prisma.Decimal(price);
    return decimal.isNegative() ? "invalid" : decimal;
  } catch {
    return "invalid";
  }
}

function validateDuration(durationMinutes: number | undefined): number | null | "invalid" {
  if (durationMinutes === undefined) return null;
  return Number.isInteger(durationMinutes) && durationMinutes > 0 ? durationMinutes : "invalid";
}

export async function createService(input: CreateServiceInput): Promise<CreateServiceResult> {
  const name = validateName(input.name);
  const price = validatePrice(input.price);
  const duration = validateDuration(input.durationMinutes);
  if (name === "invalid" || name === null || price === "invalid" || price === null || duration === "invalid" || duration === null) {
    return { ok: false, reason: "invalid_input" };
  }

  try {
    const service = await prisma.barbershopService.create({
      data: {
        barbershopId: input.barbershopId,
        name,
        price,
        durationMinutes: duration,
        isActive: true,
      },
      select: { id: true },
    });
    return { ok: true, serviceId: service.id };
  } catch (error) {
    if (isActiveNameConflict(error)) {
      return { ok: false, reason: "name_taken" };
    }
    throw error;
  }
}

export async function updateService(input: UpdateServiceInput): Promise<ServiceMutationResult> {
  const name = validateName(input.name);
  const price = validatePrice(input.price);
  const duration = validateDuration(input.durationMinutes);
  if (name === "invalid" || price === "invalid" || duration === "invalid") {
    return { ok: false, reason: "invalid_input" };
  }

  const existing = await prisma.barbershopService.findUnique({
    where: { id: input.serviceId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const data: Prisma.BarbershopServiceUpdateInput = {};
  if (name !== null) data.name = name;
  if (price !== null) data.price = price;
  if (duration !== null) data.durationMinutes = duration;

  try {
    // Editar a duração NÃO recalcula bookings existentes: o endsAt é materializado na reserva
    // (research.md D5). Apenas o serviço muda; agendamentos futuros usarão a nova duração.
    await prisma.barbershopService.update({ where: { id: input.serviceId }, data });
    return { ok: true };
  } catch (error) {
    if (isActiveNameConflict(error)) {
      return { ok: false, reason: "name_taken" };
    }
    throw error;
  }
}

export async function deactivateService(input: { serviceId: string }): Promise<ServiceMutationResult> {
  const existing = await prisma.barbershopService.findUnique({
    where: { id: input.serviceId },
    select: { isActive: true },
  });
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }
  if (!existing.isActive) {
    return { ok: false, reason: "already_inactive" };
  }
  // Soft delete: nunca delete físico, preservando agendamentos e histórico (FR-005/FR-006).
  await prisma.barbershopService.update({
    where: { id: input.serviceId },
    data: { isActive: false },
  });
  return { ok: true };
}

export async function reactivateService(input: { serviceId: string }): Promise<ServiceMutationResult> {
  const existing = await prisma.barbershopService.findUnique({
    where: { id: input.serviceId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }
  try {
    await prisma.barbershopService.update({
      where: { id: input.serviceId },
      data: { isActive: true },
    });
    return { ok: true };
  } catch (error) {
    if (isActiveNameConflict(error)) {
      return { ok: false, reason: "name_taken" };
    }
    throw error;
  }
}

export interface OwnerServiceItem {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
  isActive: boolean;
}

export async function listServicesForOwner(input: {
  barbershopId: string;
}): Promise<OwnerServiceItem[]> {
  const services = await prisma.barbershopService.findMany({
    where: { barbershopId: input.barbershopId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, price: true, durationMinutes: true, isActive: true },
  });
  return services.map((service) => ({
    id: service.id,
    name: service.name,
    price: service.price.toString(),
    durationMinutes: service.durationMinutes,
    isActive: service.isActive,
  }));
}
