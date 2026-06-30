import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { assertOwnerRole, ForbiddenError } from "@/server/auth/owner";
import { UnauthorizedError } from "@/server/auth/session";

// Teste de integração (toca Postgres) — guard de autorização por role (FR-001/Princípio I).
// Verifica a fonte de verdade no banco: CLIENT é barrado, OWNER é admitido.
const CLIENT_ID = "u-guard-client";
const OWNER_ID = "u-guard-owner";

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: CLIENT_ID },
    update: { role: "CLIENT" },
    create: { id: CLIENT_ID, email: "guard-client@example.com", role: "CLIENT" },
  });
  await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: { role: "OWNER" },
    create: { id: OWNER_ID, email: "guard-owner@example.com", role: "OWNER" },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [CLIENT_ID, OWNER_ID] } } });
  await prisma.$disconnect();
});

describe("assertOwnerRole (guard de role)", () => {
  it("nega um usuário CLIENT (ForbiddenError)", async () => {
    await expect(assertOwnerRole(CLIENT_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admite um usuário OWNER", async () => {
    await expect(assertOwnerRole(OWNER_ID)).resolves.toBeUndefined();
  });

  it("trata usuário inexistente como não autorizado (UnauthorizedError)", async () => {
    await expect(assertOwnerRole("u-does-not-exist")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
