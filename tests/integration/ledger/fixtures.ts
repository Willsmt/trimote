import { prisma } from "@/server/db/client";
import { localDateTimeToUtc } from "@/domain/time";

/**
 * Fixtures compartilhadas dos testes de integração do financeiro (005-financial-ledger).
 *
 * Reusa a barbearia/serviços/expediente já semeados (`prisma db seed`): business-trimote,
 * serviços de 30min (Corte/Barba) e 60min (Corte + Barba), expediente seg–sáb 09:00–18:00.
 * Cada arquivo de teste usa usuários e um dia próprios para evitar colisão da exclusion
 * constraint (parcial em ACTIVE) entre arquivos rodando em paralelo.
 */

export const SP = "America/Sao_Paulo";
export const BUSINESS_ID = "business-trimote";

// Serviços semeados (ver prisma/seed.ts).
export const SERVICE_CORTE = "service-corte"; // 30min, 40.00
export const SERVICE_BARBA = "service-barba"; // 30min, 30.00
export const SERVICE_CORTE_BARBA = "service-corte-barba"; // 60min, 65.00

/** Instante UTC de uma hora local (minutos desde a meia-noite) no fuso da barbearia. */
export function slotAt(dateISO: string, minutesFromMidnight: number): Date {
  return localDateTimeToUtc(dateISO, minutesFromMidnight, SP);
}

/** Garante a existência de usuários de teste com papel explícito (idempotente). */
export async function upsertUsers(
  users: { id: string; email: string; role?: "CLIENT" | "OWNER" }[],
): Promise<void> {
  for (const u of users) {
    const role = u.role ?? "CLIENT";
    await prisma.user.upsert({
      where: { id: u.id },
      update: { role },
      create: { id: u.id, email: u.email, role },
    });
  }
}

/**
 * Semeia um booking diretamente no banco (bypassa as guardas do core), calculando `endsAt` pela
 * duração do serviço. Permite estados arbitrários (ACTIVE por padrão) para os cenários financeiros
 * (ex.: um COMPLETED para testar recusa de nova conclusão/remarcação/cancelamento). Retorna o `id`.
 */
export async function seedBooking(input: {
  userId: string;
  serviceId: string;
  startsAt: Date;
  status?: "ACTIVE" | "CANCELLED" | "COMPLETED";
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

/**
 * Remove lançamentos (e itens via cascade) ligados aos usuários informados, seja como autor
 * (`createdBy`) ou como cliente (`clientId`), e os bookings desses usuários. Limpeza entre testes.
 */
export async function cleanupLedgerAndBookings(userIds: string[]): Promise<void> {
  await prisma.ledgerEntry.deleteMany({
    where: { OR: [{ createdBy: { in: userIds } }, { clientId: { in: userIds } }] },
  });
  await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
}

/** Remove lançamentos, bookings e usuários de teste e encerra a conexão (afterAll). */
export async function teardownUsers(userIds: string[]): Promise<void> {
  await cleanupLedgerAndBookings(userIds);
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
