import { prisma } from "@/server/db/client";
import { localDateTimeToUtc } from "@/domain/time";

/**
 * Fixtures compartilhadas dos testes de integração de remarcação (004-reschedule-booking).
 *
 * Reusa a barbearia/serviços/expediente já semeados (`prisma db seed`): business-trimote,
 * serviços de 30min (Corte/Barba) e 60min (Corte + Barba), expediente seg–sáb 09:00–18:00.
 * Cada arquivo de teste usa um dia e usuários próprios para evitar colisão da exclusion
 * constraint (parcial em ACTIVE) entre arquivos rodando em paralelo.
 */

export const SP = "America/Sao_Paulo";
export const BUSINESS_ID = "business-trimote";

// Serviços semeados (ver prisma/seed.ts).
export const SERVICE_CORTE = "service-corte"; // 30min
export const SERVICE_BARBA = "service-barba"; // 30min
export const SERVICE_CORTE_BARBA = "service-corte-barba"; // 60min

/** Instante UTC de uma hora local (minutos desde a meia-noite) no fuso da barbearia. */
export function slotAt(dateISO: string, minutesFromMidnight: number): Date {
  return localDateTimeToUtc(dateISO, minutesFromMidnight, SP);
}

/** Garante a existência dos usuários de teste (idempotente). */
export async function upsertUsers(users: { id: string; email: string }[]): Promise<void> {
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { id: u.id, email: u.email },
    });
  }
}

/**
 * Semeia um booking diretamente no banco (bypassa as guardas do core), calculando `endsAt` pela
 * duração do serviço. Permite estados arbitrários (ativo/futuro por padrão) para os cenários de
 * remarcação. Retorna o `id` criado (identidade a preservar no move).
 */
export async function seedBooking(input: {
  userId: string;
  serviceId: string;
  startsAt: Date;
  status?: "ACTIVE" | "CANCELLED";
}): Promise<string> {
  const service = await prisma.service.findUniqueOrThrow({
    where: { id: input.serviceId },
    select: { businessId: true, durationMinutes: true },
  });
  const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);

  const booking = await prisma.booking.create({
    data: {
      businessId: service.businessId,
      userId: input.userId,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      endsAt,
      status: input.status ?? "ACTIVE",
      ...(input.status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
    },
    select: { id: true },
  });
  return booking.id;
}

/** Remove todos os bookings dos usuários informados (limpeza entre testes). */
export async function cleanupBookings(userIds: string[]): Promise<void> {
  await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
}

/** Remove usuários de teste e encerra a conexão (afterAll). */
export async function teardownUsers(userIds: string[]): Promise<void> {
  await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
