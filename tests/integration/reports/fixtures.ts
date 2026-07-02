import { Prisma, type PaymentMethod } from "@prisma/client";

import { prisma } from "@/server/db/client";
import {
  BARBERSHOP_ID,
  SP,
  slotAt,
  upsertUsers,
  cleanupLedgerAndBookings,
} from "../ledger/fixtures";

/**
 * Fixtures dos testes de integração de LEITURA do financeiro (006-financial-reports). Reutiliza a
 * barbearia/serviços/usuários das fixtures da F005 e adiciona `seedLedgerEntry`, que insere um
 * `LedgerEntry` (com itens opcionais) em um instante CONHECIDO — permitindo cenários de fuso, de
 * inativos e de breakdown sem passar pelos caminhos de escrita da F005.
 */

export { BARBERSHOP_ID, SP, slotAt, upsertUsers, cleanupLedgerAndBookings };

const D = (v: number | string) => new Prisma.Decimal(v);

export interface SeedLedgerEntryInput {
  /** Autor (createdBy) — usado também pela limpeza (cleanupLedgerAndBookings). */
  createdBy: string;
  type: "INCOME" | "EXPENSE";
  origin: "BOOKING" | "WALK_IN" | "EXPENSE";
  amount: number | string;
  /** Instante UTC do lançamento (use `slotAt(date, minutos)` para uma hora local conhecida). */
  occurredAt: Date;
  paymentMethod?: PaymentMethod | null;
  category?: string | null;
  clientId?: string | null;
  isActive?: boolean;
  description?: string;
  bookingId?: string | null;
  items?: { description: string; amount: number | string; serviceId?: string | null }[];
}

/** Insere um `LedgerEntry` (e itens) na barbearia do MVP. Retorna o `id`. */
export async function seedLedgerEntry(input: SeedLedgerEntryInput): Promise<string> {
  const entry = await prisma.ledgerEntry.create({
    data: {
      barbershopId: BARBERSHOP_ID,
      type: input.type,
      origin: input.origin,
      amount: D(input.amount),
      occurredAt: input.occurredAt,
      description: input.description ?? `${input.origin} seed`,
      category: input.category ?? null,
      paymentMethod: input.paymentMethod ?? null,
      bookingId: input.bookingId ?? null,
      clientId: input.clientId ?? null,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy,
      ...(input.items
        ? {
            items: {
              create: input.items.map((it) => ({
                serviceId: it.serviceId ?? null,
                description: it.description,
                amount: D(it.amount),
              })),
            },
          }
        : {}),
    },
    select: { id: true },
  });
  return entry.id;
}
