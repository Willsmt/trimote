import type { PaymentMethod } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { allAmountsPositive, buildServiceItem, sumItems } from "./ledger-items";

/**
 * Núcleo da conclusão de atendimento (005-financial-ledger, US1), testável com um `ownerId`
 * explícito — a Server Action deriva o OWNER da sessão via `requireOwner` (autorização por ROLE,
 * NÃO por posse do booking: no Booking `userId` é o CLIENTE que agendou).
 *
 * Concluir marca o booking como `COMPLETED` e gera, na MESMA transação (FR-003), um `LedgerEntry`
 * de receita (INCOME/BOOKING) com um item do serviço agendado. O valor do item é um SNAPSHOT do
 * preço no ato da conclusão (FR-002) — lido SEM filtrar `isActive` (registra o que aconteceu; D5).
 *
 * Ordem de verificação (curto-circuito; nenhuma recusa escreve nada):
 *   booking_not_found → already_completed → booking_cancelled → service_not_found → invalid_amount
 *   → $transaction(update COMPLETED + create LedgerEntry+item)
 */

export interface CompleteBookingInput {
  /** OWNER que registra (createdBy — auditoria). Derivado da sessão pela Server Action. */
  ownerId: string;
  bookingId: string;
  /** Instante da captura (FR-017); default agora. NÃO derivado do endsAt do booking. */
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
}

export type CompleteBookingReason =
  | "booking_not_found"
  | "already_completed"
  | "booking_cancelled"
  | "service_not_found"
  | "invalid_amount";

export type CompleteBookingResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; reason: CompleteBookingReason };

export async function completeBookingForOwner(
  input: CompleteBookingInput,
): Promise<CompleteBookingResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, status: true, barbershopId: true, serviceId: true, userId: true },
  });

  if (!booking) {
    return { ok: false, reason: "booking_not_found" };
  }
  // Estado terminal: não se conclui duas vezes (FR-004) — reason distinto para a UI (D3).
  if (booking.status === "COMPLETED") {
    return { ok: false, reason: "already_completed" };
  }
  // Não se conclui um agendamento cancelado.
  if (booking.status === "CANCELLED") {
    return { ok: false, reason: "booking_cancelled" };
  }

  // Snapshot do preço do serviço agendado — SEM filtrar isActive (D5/FR-002).
  const service = await prisma.barbershopService.findUnique({
    where: { id: booking.serviceId },
    select: { id: true, name: true, price: true },
  });
  if (!service) {
    return { ok: false, reason: "service_not_found" };
  }

  const items = [
    buildServiceItem({ serviceId: service.id, description: service.name, price: service.price }),
  ];
  if (!allAmountsPositive(items)) {
    return { ok: false, reason: "invalid_amount" };
  }
  const amount = sumItems(items);
  const occurredAt = input.occurredAt ?? new Date();

  // Atomicidade (FR-003): conclusão + lançamento + item na MESMA transação. Se o create falhar
  // (ex.: FK), o update do booking é revertido — nunca fica COMPLETED sem lançamento.
  const entry = await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } });
    return tx.ledgerEntry.create({
      data: {
        barbershopId: booking.barbershopId,
        type: "INCOME",
        origin: "BOOKING",
        amount,
        occurredAt,
        description: service.name,
        paymentMethod: input.paymentMethod ?? null,
        bookingId: booking.id,
        clientId: booking.userId,
        createdBy: input.ownerId,
        items: {
          create: items.map((item) => ({
            serviceId: item.serviceId,
            description: item.description,
            amount: item.amount,
          })),
        },
      },
      select: { id: true },
    });
  });

  return { ok: true, ledgerEntryId: entry.id };
}
