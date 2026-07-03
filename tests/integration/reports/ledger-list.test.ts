import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Mock de sessão (padrão lockdown da F005) — só afeta a Server Action; o core roda com ids explícitos.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

import { prisma } from "@/server/db/client";
import { ForbiddenError } from "@/server/auth/owner";
import { listLedgerForOwner, type LedgerListInput } from "@/server/ledger/ledger-list";
import { listLedger } from "@/server/actions/list-ledger";
import { getCashSummaryForOwner } from "@/server/ledger/cash-summary";
import { deactivateLedgerEntryForOwner } from "@/server/ledger/deactivate-ledger-entry";
import { BUSINESS_ID, SP, slotAt, seedLedgerEntry, upsertUsers, cleanupLedgerAndBookings } from "./fixtures";
import { SERVICE_CORTE, seedBooking } from "../ledger/fixtures";

// Integração (Postgres) do razão paginado (US3) + consistência com o caixa (US1) e autorização da
// action. Ano 2032 isola do restante (a listagem é por barbearia). Keyset (occurredAt, id) desc,
// pageSize+1 (FR-010/011/SC-006), filtros em conjunção (FR-012/SC-007), inativos sob filtro
// (FR-015/SC-008), itens na expansão (FR-014) e consistência caixa×listagem (FR-024/SC-004).
const OWNER_ID = "u-it-list-owner";
const CLIENT_ID = "u-it-list-client";
const D = (v: string) => new Prisma.Decimal(v);
const SEP = { granularity: "month", referenceLocalDate: "2032-09-15" } as const;

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "list-owner@example.com", role: "OWNER" },
    { id: CLIENT_ID, email: "list-client@example.com", role: "CLIENT" },
  ]);
});

afterEach(async () => {
  actAs(null);
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_ID]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

const baseInput = (over: Partial<LedgerListInput> = {}): LedgerListInput => ({
  businessId: BUSINESS_ID,
  timeZone: SP,
  filter: { period: SEP },
  ...over,
});

/** Pagina até o fim, devolvendo as linhas na ordem em que saem. */
async function pageAll(over: Partial<LedgerListInput>, pageSize: number) {
  const rows: { id: string; occurredAt: Date }[] = [];
  let cursor: LedgerListInput["cursor"] | undefined = undefined;
  for (;;) {
    const r = await listLedgerForOwner(baseInput({ ...over, cursor, pageSize }));
    rows.push(...r.rows.map((x) => ({ id: x.id, occurredAt: x.occurredAt })));
    if (!r.nextCursor) break;
    cursor = r.nextCursor;
  }
  return rows;
}

describe("listLedgerForOwner — ordem e keyset (US3)", () => {
  it("mais-recente-primeiro e keyset estável com occurredAt EMPATADO, sem repetir/pular (SC-006)", async () => {
    // 3 linhas no MESMO instante + 2 em instantes distintos = 5.
    const tie = new Date("2032-09-10T13:00:00.000Z");
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "10.00", occurredAt: tie });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "10.00", occurredAt: tie });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "10.00", occurredAt: tie });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "EXPENSE", origin: "EXPENSE", amount: "5.00", occurredAt: slotAt("2032-09-12", 600) });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "BOOKING", amount: "7.00", occurredAt: slotAt("2032-09-05", 600) });

    const rows = await pageAll({}, 2); // pageSize 2 força várias páginas

    // Sem repetir nem pular: 5 ids únicos.
    const ids = rows.map((r) => r.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);

    // Ordenação monotônica não-crescente por (occurredAt desc, id desc).
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const ok =
        prev.occurredAt > cur.occurredAt ||
        (prev.occurredAt.getTime() === cur.occurredAt.getTime() && prev.id > cur.id);
      expect(ok).toBe(true);
    }
  });

  it("pageSize+1 → hasMore via nextCursor; última página tem nextCursor null", async () => {
    for (let i = 0; i < 3; i++) {
      await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "1.00", occurredAt: slotAt("2032-09-0" + (i + 1), 600) });
    }
    const p1 = await listLedgerForOwner(baseInput({ pageSize: 2 }));
    expect(p1.rows).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listLedgerForOwner(baseInput({ pageSize: 2, cursor: p1.nextCursor! }));
    expect(p2.rows).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
  });
});

describe("listLedgerForOwner — filtros (US3)", () => {
  it("filtros em conjunção (tipo + forma), UNSET → null (SC-007)", async () => {
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "10.00", occurredAt: slotAt("2032-09-10", 600), paymentMethod: "PIX" });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "20.00", occurredAt: slotAt("2032-09-11", 600), paymentMethod: "CASH" });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "EXPENSE", origin: "EXPENSE", amount: "30.00", occurredAt: slotAt("2032-09-12", 600), paymentMethod: "PIX" });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "40.00", occurredAt: slotAt("2032-09-13", 600), paymentMethod: null });

    const pix = await listLedgerForOwner(baseInput({ filter: { period: SEP, type: "INCOME", paymentMethod: "PIX" } }));
    expect(pix.rows).toHaveLength(1);
    expect(pix.rows[0].amount.equals(D("10.00"))).toBe(true);

    const unset = await listLedgerForOwner(baseInput({ filter: { period: SEP, paymentMethod: "UNSET" } }));
    expect(unset.rows).toHaveLength(1);
    expect(unset.rows[0].paymentMethod).toBeNull();
    expect(unset.rows[0].amount.equals(D("40.00"))).toBe(true);
  });

  it("inativos ausentes por padrão; presentes e marcados sob includeInactive (SC-008)", async () => {
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "10.00", occurredAt: slotAt("2032-09-10", 600) });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "99.00", occurredAt: slotAt("2032-09-11", 600), isActive: false });

    const def = await listLedgerForOwner(baseInput());
    expect(def.rows).toHaveLength(1);
    expect(def.rows.every((r) => r.isActive)).toBe(true);

    const withInactive = await listLedgerForOwner(baseInput({ filter: { period: SEP, includeInactive: true } }));
    expect(withInactive.rows).toHaveLength(2);
    expect(withInactive.rows.some((r) => !r.isActive)).toBe(true);
  });

  it("linha de receita traz seus itens na expansão (FR-014)", async () => {
    await seedLedgerEntry({
      createdBy: OWNER_ID,
      type: "INCOME",
      origin: "WALK_IN",
      amount: "55.00",
      occurredAt: slotAt("2032-09-10", 600),
      items: [
        { description: "Corte", amount: "40.00" },
        { description: "Gorjeta", amount: "15.00" },
      ],
    });
    const r = await listLedgerForOwner(baseInput());
    expect(r.rows[0].items).toHaveLength(2);
    expect(r.rows[0].items.map((i) => i.description).sort()).toEqual(["Corte", "Gorjeta"]);
  });
});

describe("consistência caixa × listagem (US3/US1 — FR-024)", () => {
  it("saldo do caixa == Σ income − Σ expense da listagem no mesmo período (inativos fora dos dois)", async () => {
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "40.10", occurredAt: slotAt("2032-09-03", 600), paymentMethod: "CASH" });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "BOOKING", amount: "30.05", occurredAt: slotAt("2032-09-07", 600), paymentMethod: "PIX" });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "EXPENSE", origin: "EXPENSE", amount: "20.30", occurredAt: slotAt("2032-09-09", 600), category: "produtos" });
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "99.00", occurredAt: slotAt("2032-09-11", 600), isActive: false }); // fora

    const rows = await pageAll({ pageSize: 2 }, 2);
    expect(rows).toHaveLength(3); // inativo não entra

    // Recomputa somando as linhas (precisa dos amounts+type — busca via core sem paginar corta amount,
    // então soma a partir de uma listagem completa).
    let sum = new Prisma.Decimal(0);
    let cursor: LedgerListInput["cursor"] | undefined = undefined;
    for (;;) {
      const page = await listLedgerForOwner(baseInput({ pageSize: 2, cursor }));
      for (const row of page.rows) {
        sum = row.type === "INCOME" ? sum.plus(row.amount) : sum.minus(row.amount);
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const cash = await getCashSummaryForOwner({ businessId: BUSINESS_ID, timeZone: SP, granularity: "month", referenceLocalDate: "2032-09-15" });
    expect(cash.balance.equals(sum)).toBe(true); // 40.10 + 30.05 - 20.30 = 49.85
    expect(cash.balance.equals(D("49.85"))).toBe(true);
  });
});

describe("inativar a partir da listagem — reuso do soft delete da F005 (US4)", () => {
  it("inativa um lançamento ANTIGO: sai da lista/caixa; booking de origem BOOKING segue COMPLETED (SC-009)", async () => {
    const OCT = { granularity: "month", referenceLocalDate: "2032-10-15" } as const;
    const cash = () =>
      getCashSummaryForOwner({ businessId: BUSINESS_ID, timeZone: SP, granularity: "month", referenceLocalDate: "2032-10-15" });

    // Booking concluído + lançamento de origem BOOKING (o "antigo").
    const bookingId = await seedBooking({ userId: CLIENT_ID, serviceId: SERVICE_CORTE, startsAt: slotAt("2032-10-05", 600), status: "COMPLETED" });
    const oldEntry = await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "BOOKING", amount: "40.00", occurredAt: slotAt("2032-10-05", 600), clientId: CLIENT_ID, bookingId });
    // Lançamento mais novo → garante que o inativado NÃO é o último criado (limitação da F005).
    await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "10.00", occurredAt: slotAt("2032-10-08", 600) });

    expect((await cash()).income.equals(D("50.00"))).toBe(true);

    // Reusa o core de soft delete da F005 SEM mudança.
    const res = await deactivateLedgerEntryForOwner({ ledgerEntryId: oldEntry });
    expect(res.ok).toBe(true);

    const def = await listLedgerForOwner(baseInput({ filter: { period: OCT } }));
    expect(def.rows.map((r) => r.id)).not.toContain(oldEntry);

    const all = await listLedgerForOwner(baseInput({ filter: { period: OCT, includeInactive: true } }));
    expect(all.rows.find((r) => r.id === oldEntry)?.isActive).toBe(false);

    expect((await cash()).income.equals(D("10.00"))).toBe(true); // 40 inativado saiu

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("COMPLETED"); // FR-018: soft delete não reabre o agendamento
  });
});

describe("listLedger (Server Action) — autorização por role (SC-011)", () => {
  it("nega CLIENT (ForbiddenError) e admite OWNER", async () => {
    actAs(CLIENT_ID);
    await expect(listLedger({ filter: {} })).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(listLedger({ filter: {} })).resolves.toMatchObject({ rows: expect.any(Array) });
  });
});
