import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Mock de sessão (padrão da F005) para a Server Action; o core roda com userId explícito.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

import { prisma } from "@/server/db/client";
import { UnauthorizedError } from "@/server/auth/session";
import { listClientHistory } from "@/server/ledger/client-history";
import { listMyLedger } from "@/server/actions/list-my-ledger";
import { slotAt, seedLedgerEntry, upsertUsers, cleanupLedgerAndBookings } from "./fixtures";

// Integração (Postgres) do histórico do CLIENT (US5). Só receitas ATIVAS do próprio clientId
// (SC-010); nunca despesas, outros clientes, anônimos (clientId null) nem inativos. Filtro SEMPRE da
// sessão — a action não tem o parâmetro clientId (SC-011). Ano 2033 isola.
const OWNER_ID = "u-it-hist-owner";
const CLIENT_A = "u-it-hist-a";
const CLIENT_B = "u-it-hist-b";
const D = (v: string) => new Prisma.Decimal(v);

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await upsertUsers([
    { id: OWNER_ID, email: "hist-owner@example.com", role: "OWNER" },
    { id: CLIENT_A, email: "hist-a@example.com", role: "CLIENT" },
    { id: CLIENT_B, email: "hist-b@example.com", role: "CLIENT" },
  ]);
});

afterEach(async () => {
  actAs(null);
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_A, CLIENT_B]);
});

afterAll(async () => {
  await cleanupLedgerAndBookings([OWNER_ID, CLIENT_A, CLIENT_B]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, CLIENT_A, CLIENT_B] } } });
  await prisma.$disconnect();
});

/** Cenário misto: A (2 ativas + 1 inativa), B (1), anônimo (1) e uma despesa. */
async function seedMixed() {
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "BOOKING", amount: "40.00", occurredAt: slotAt("2033-05-05", 600), clientId: CLIENT_A, items: [{ description: "Corte", amount: "40.00" }] });
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "30.00", occurredAt: slotAt("2033-05-07", 600), clientId: CLIENT_A });
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "99.00", occurredAt: slotAt("2033-05-08", 600), clientId: CLIENT_A, isActive: false }); // inativa
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "50.00", occurredAt: slotAt("2033-05-09", 600), clientId: CLIENT_B }); // outro cliente
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "20.00", occurredAt: slotAt("2033-05-10", 600), clientId: null }); // anônimo
  await seedLedgerEntry({ createdBy: OWNER_ID, type: "EXPENSE", origin: "EXPENSE", amount: "10.00", occurredAt: slotAt("2033-05-11", 600) }); // despesa
}

describe("listClientHistory (core) — não vaza (US5, SC-010)", () => {
  it("só receitas ATIVAS do próprio cliente; ordem mais-recente-primeiro; itens presentes", async () => {
    await seedMixed();
    const r = await listClientHistory({ userId: CLIENT_A });

    expect(r.rows).toHaveLength(2); // exclui inativa, B, anônimo, despesa
    expect(r.rows[0].amount.equals(D("30.00"))).toBe(true); // 07/05 mais recente que 05/05
    expect(r.rows[1].amount.equals(D("40.00"))).toBe(true);
    expect(r.rows[1].items).toHaveLength(1); // itens na expansão
    expect(r.nextCursor).toBeNull();
  });

  it("keyset: pageSize+1 pagina sem repetir/pular", async () => {
    for (let i = 1; i <= 3; i++) {
      await seedLedgerEntry({ createdBy: OWNER_ID, type: "INCOME", origin: "WALK_IN", amount: "1.00", occurredAt: slotAt("2033-06-0" + i, 600), clientId: CLIENT_A });
    }
    const p1 = await listClientHistory({ userId: CLIENT_A, pageSize: 2 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listClientHistory({ userId: CLIENT_A, pageSize: 2, cursor: p1.nextCursor! });
    expect(p2.rows).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    const ids = [...p1.rows, ...p2.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("listMyLedger (Server Action) — filtro sempre da sessão (US5, SC-011)", () => {
  it("usa o clientId da SESSÃO (não do input) e nega visitante não autenticado", async () => {
    await seedMixed();

    actAs(CLIENT_B);
    const bView = await listMyLedger({});
    expect(bView.rows).toHaveLength(1); // só a receita de B
    expect(Number(bView.rows[0].amount)).toBe(50); // amount serializado como string (Decimal→string)

    actAs(CLIENT_A);
    const aView = await listMyLedger({});
    expect(aView.rows).toHaveLength(2); // só as de A

    actAs(null);
    await expect(listMyLedger({})).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
