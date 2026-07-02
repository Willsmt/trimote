import { Prisma, type PaymentMethod } from "@prisma/client";

import { prisma } from "@/server/db/client";
import {
  allAmountsPositive,
  buildServiceItem,
  normalizeDescription,
  sumItems,
  type LedgerItemInput,
} from "./ledger-items";

/**
 * Núcleo da conclusão de atendimento (005-financial-ledger, US1), testável com um `ownerId`
 * explícito — a Server Action deriva o OWNER da sessão via `requireOwner` (autorização por ROLE,
 * NÃO por posse do booking: no Booking `userId` é o CLIENTE que agendou).
 *
 * Concluir marca o booking como `COMPLETED` e gera, na MESMA transação (FR-003), um `LedgerEntry`
 * de receita (INCOME/BOOKING) com um item do serviço agendado. O valor do item é um SNAPSHOT do
 * preço no ato da conclusão (FR-002) — lido SEM filtrar `isActive` (registra o que aconteceu; D5).
 *
 * Extras (US2) são capturados AQUI, no ato da conclusão (não há edição pós-COMPLETED — só soft
 * delete): item de serviço (snapshot do preço) ou item manual (valor informado). O `amount` do
 * lançamento é a soma dos itens (base + extras), validada dentro da transação (FR-006/FR-007).
 *
 * Ordem de verificação (curto-circuito; nenhuma recusa escreve nada):
 *   booking_not_found → already_completed → booking_cancelled → service_not_found →
 *   invalid_description (extra manual) → invalid_amount
 *   → $transaction(update COMPLETED + create LedgerEntry+itens)
 */

/** Extra capturado na conclusão: item de serviço (snapshot) OU item manual (valor informado). */
export interface CompleteBookingExtraInput {
  /** Serviço do catálogo (snapshot do preço) ou ausente para extra manual. */
  serviceId?: string;
  description: string;
  /** Obrigatório para extra manual; ignorado para extra de serviço (usa o snapshot). */
  amount?: number;
}

export interface CompleteBookingInput {
  /** OWNER que registra (createdBy — auditoria). Derivado da sessão pela Server Action. */
  ownerId: string;
  bookingId: string;
  /** Instante da captura (FR-017); default agora. NÃO derivado do endsAt do booking. */
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
  /** Extras feitos na hora (US2). Capturados só aqui — não há edição pós-conclusão. */
  extras?: CompleteBookingExtraInput[];
}

export type CompleteBookingReason =
  | "booking_not_found"
  | "already_completed"
  | "booking_cancelled"
  | "service_not_found"
  | "invalid_amount"
  | "invalid_description";

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

  const items: LedgerItemInput[] = [
    buildServiceItem({ serviceId: service.id, description: service.name, price: service.price }),
  ];

  // Extras (US2): serviço → snapshot do preço (SEM filtrar isActive); manual → valor informado.
  for (const extra of input.extras ?? []) {
    if (extra.serviceId) {
      const extraService = await prisma.barbershopService.findUnique({
        where: { id: extra.serviceId },
        select: { id: true, name: true, price: true },
      });
      if (!extraService) {
        return { ok: false, reason: "service_not_found" };
      }
      items.push(
        buildServiceItem({
          serviceId: extraService.id,
          description: extra.description || extraService.name,
          price: extraService.price,
        }),
      );
    } else {
      // Extra manual sem valor não pode existir (FR-011).
      if (extra.amount == null) {
        return { ok: false, reason: "invalid_amount" };
      }
      // Extra manual sem descrição não identifica a linha — rejeita e persiste sem espaços nas pontas.
      const description = normalizeDescription(extra.description);
      if (description === null) {
        return { ok: false, reason: "invalid_description" };
      }
      items.push({
        serviceId: null,
        description,
        amount: new Prisma.Decimal(extra.amount),
      });
    }
  }

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
