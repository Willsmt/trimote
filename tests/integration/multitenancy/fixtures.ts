import { prisma } from "@/server/db/client";
import { upsertUsers, cleanupLedgerAndBookings } from "../ledger/fixtures";

/**
 * Fixtures dos testes de integração da multi-tenancy (007). Cria negócios, vínculos (BusinessMember)
 * e sessões com negócio ativo. Reutiliza `upsertUsers`/`cleanupLedgerAndBookings` da F005.
 */

export { upsertUsers, cleanupLedgerAndBookings };

export const DEMO_BUSINESS_ID = "business-trimote";

/** Cria (idempotente) um negócio de teste com slug único. Retorna o id. */
export async function createTestBusiness(input: {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
}): Promise<string> {
  await prisma.business.upsert({
    where: { id: input.id },
    update: {},
    create: {
      id: input.id,
      name: input.name,
      slug: input.slug,
      timezone: input.timezone ?? "America/Sao_Paulo",
    },
  });
  return input.id;
}

/** Vincula um usuário como membro (OWNER por padrão) de um negócio. */
export async function addMembership(input: {
  userId: string;
  businessId: string;
  createdBy: string;
  role?: "OWNER";
}): Promise<void> {
  await prisma.businessMember.upsert({
    where: { userId_businessId: { userId: input.userId, businessId: input.businessId } },
    update: {},
    create: {
      userId: input.userId,
      businessId: input.businessId,
      role: input.role ?? "OWNER",
      createdBy: input.createdBy,
    },
  });
}

/** Cria uma Session para o usuário (token conhecido) com um negócio ativo opcional. Retorna o token. */
export async function createSession(input: {
  userId: string;
  sessionToken: string;
  activeBusinessId?: string | null;
}): Promise<string> {
  await prisma.session.upsert({
    where: { sessionToken: input.sessionToken },
    update: { activeBusinessId: input.activeBusinessId ?? null },
    create: {
      sessionToken: input.sessionToken,
      userId: input.userId,
      expires: new Date(Date.now() + 24 * 60 * 60_000),
      activeBusinessId: input.activeBusinessId ?? null,
    },
  });
  return input.sessionToken;
}

/** Remove negócios de teste (cascade em members/services/bookings/ledger daquele negócio). */
export async function cleanupBusinesses(ids: string[]): Promise<void> {
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
}

/** Remove vínculos e sessões de teste dos usuários informados. */
export async function cleanupMembershipsAndSessions(userIds: string[]): Promise<void> {
  await prisma.businessMember.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
}
