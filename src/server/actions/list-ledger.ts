"use server";

import { requireOwner } from "@/server/auth/owner";
import { prisma } from "@/server/db/client";
import {
  listLedgerForOwner,
  type LedgerListFilter,
  type LedgerCursor,
} from "@/server/ledger/ledger-list";
import type { Granularity } from "@/domain/time";

/**
 * Server Action do razão (006, US3). Exige OWNER (autorização por ROLE — `requireOwner`, FR-022) e
 * resolve barbearia/fuso no servidor. Toda a entrada (filtro e cursor) é validada por WHITELIST no
 * servidor (Princípio I) antes de compor o `where` do core. Serializa Decimal→string e datas→ISO na
 * fronteira Server→Client (D5).
 */

export interface LedgerRowDTO {
  id: string;
  occurredAtIso: string;
  type: "INCOME" | "EXPENSE";
  origin: "BOOKING" | "WALK_IN" | "EXPENSE";
  description: string;
  paymentMethod: "CASH" | "PIX" | "CARD" | "ONLINE" | "OTHER" | null;
  amount: string;
  isActive: boolean;
  items: { description: string; amount: string }[];
}

export interface LedgerPageDTO {
  rows: LedgerRowDTO[];
  nextCursor: { occurredAtIso: string; id: string } | null;
}

const TYPES = ["INCOME", "EXPENSE"] as const;
const ORIGINS = ["BOOKING", "WALK_IN", "EXPENSE"] as const;
const PAYMENT_METHODS = ["CASH", "PIX", "CARD", "ONLINE", "OTHER", "UNSET"] as const;
const GRANULARITIES = ["day", "week", "month", "year"] as const;

function pick<T extends readonly string[]>(list: T, value: unknown): T[number] | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

/** Reconstrói um filtro seguro a partir de entrada arbitrária: só campos/valores conhecidos entram. */
function sanitizeFilter(input: LedgerListFilter | undefined): LedgerListFilter {
  const f = input ?? {};
  const clean: LedgerListFilter = {};
  const type = pick(TYPES, f.type);
  if (type) clean.type = type;
  const origin = pick(ORIGINS, f.origin);
  if (origin) clean.origin = origin;
  const pm = pick(PAYMENT_METHODS, f.paymentMethod);
  if (pm) clean.paymentMethod = pm;
  if (typeof f.category === "string") clean.category = f.category; // "UNSET" ou texto livre
  if (f.includeInactive === true) clean.includeInactive = true;
  if (f.period && typeof f.period.referenceLocalDate === "string") {
    const gran = pick(GRANULARITIES, f.period.granularity) as Granularity | undefined;
    if (gran && /^\d{4}-\d{2}-\d{2}$/.test(f.period.referenceLocalDate)) {
      clean.period = { granularity: gran, referenceLocalDate: f.period.referenceLocalDate };
    }
  }
  return clean;
}

/** Valida o cursor da entrada; entrada inválida = sem cursor (primeira página). */
function parseCursor(input: { occurredAtIso: string; id: string } | undefined): LedgerCursor | undefined {
  if (!input || typeof input.id !== "string" || typeof input.occurredAtIso !== "string") return undefined;
  const occurredAt = new Date(input.occurredAtIso);
  if (Number.isNaN(occurredAt.getTime())) return undefined;
  return { occurredAt, id: input.id };
}

export async function listLedger(input: {
  filter?: LedgerListFilter;
  cursor?: { occurredAtIso: string; id: string };
}): Promise<LedgerPageDTO> {
  const { businessId, timeZone } = await requireOwner();

  const result = await listLedgerForOwner({
    businessId,
    timeZone,
    filter: sanitizeFilter(input.filter),
    cursor: parseCursor(input.cursor),
  });

  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      occurredAtIso: r.occurredAt.toISOString(),
      type: r.type,
      origin: r.origin,
      description: r.description,
      paymentMethod: r.paymentMethod,
      amount: r.amount.toString(),
      isActive: r.isActive,
      items: r.items.map((it) => ({ description: it.description, amount: it.amount.toString() })),
    })),
    nextCursor: result.nextCursor
      ? { occurredAtIso: result.nextCursor.occurredAt.toISOString(), id: result.nextCursor.id }
      : null,
  };
}
