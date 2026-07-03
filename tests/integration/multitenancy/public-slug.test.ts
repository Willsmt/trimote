import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { listServicesForBusiness } from "@/server/actions/list-services";
import { createTestBusiness, cleanupBusinesses } from "./fixtures";

// Integração (Postgres) da leitura pública de serviços por negócio (US4, FR-019). O catálogo é POR
// negócio — nunca global (anti-vazamento; ver R2/T036a). Slugs de A e B isolam serviços.
const BIZ_A = "biz-ps-a";
const BIZ_B = "biz-ps-b";
const D = (v: string) => new Prisma.Decimal(v);

beforeAll(async () => {
  await createTestBusiness({ id: BIZ_A, name: "A", slug: "ps-a" });
  await createTestBusiness({ id: BIZ_B, name: "B", slug: "ps-b" });
  await prisma.service.createMany({
    data: [
      { id: "ps-svc-a1", businessId: BIZ_A, name: "Corte A", price: D("40.00"), durationMinutes: 30 },
      { id: "ps-svc-a2", businessId: BIZ_A, name: "Inativo A", price: D("10.00"), durationMinutes: 15, isActive: false },
      { id: "ps-svc-b1", businessId: BIZ_B, name: "Corte B", price: D("50.00"), durationMinutes: 30 },
    ],
  });
});

afterAll(async () => {
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.$disconnect();
});

describe("listServicesForBusiness (US4)", () => {
  it("retorna só os serviços ATIVOS daquele negócio (isola A de B)", async () => {
    const a = await listServicesForBusiness(BIZ_A);
    expect(a.map((s) => s.id).sort()).toEqual(["ps-svc-a1"]); // inativo fora; nada de B
    const b = await listServicesForBusiness(BIZ_B);
    expect(b.map((s) => s.id)).toEqual(["ps-svc-b1"]);
  });
});
