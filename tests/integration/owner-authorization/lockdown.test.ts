import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";

// Controla o usuário "logado" via mock da camada de sessão (vi.hoisted evita TDZ no factory).
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
import { createService } from "@/server/actions/create-service";
import { updateService } from "@/server/actions/update-service";
import { deactivateService } from "@/server/actions/deactivate-service";
import { reactivateService } from "@/server/actions/reactivate-service";
import { setOpeningHours } from "@/server/actions/set-opening-hours";
import { closeDay } from "@/server/actions/close-day";

// Lockdown do painel (FR-001/SC-001): TODA operação de gestão nega CLIENT e admite OWNER.
const BUSINESS_ID = "business-trimote";
const CLIENT_ID = "u-lockdown-client";
const OWNER_ID = "u-lockdown-owner";
const PREFIX = "ZZUS3-";
const TEST_WEEKDAY = 0; // domingo (fechado no seed) — restaurado no afterEach

let targetServiceId: string;

function actAs(userId: string | null) {
  mockState.userId = userId;
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: CLIENT_ID },
    update: { role: "CLIENT" },
    create: { id: CLIENT_ID, email: "lockdown-client@example.com", role: "CLIENT" },
  });
  await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: { role: "OWNER" },
    create: { id: OWNER_ID, email: "lockdown-owner@example.com", role: "OWNER" },
  });
});

beforeEach(async () => {
  // Serviço alvo fresco (criado direto, fora das actions) para update/deactivate/reactivate.
  const service = await prisma.service.create({
    data: {
      businessId: BUSINESS_ID,
      name: `${PREFIX}target`,
      price: "30.00",
      durationMinutes: 30,
      isActive: true,
    },
    select: { id: true },
  });
  targetServiceId = service.id;
});

afterEach(async () => {
  actAs(null);
  await prisma.service.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.openingHours.deleteMany({ where: { businessId: BUSINESS_ID, weekday: TEST_WEEKDAY } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [CLIENT_ID, OWNER_ID] } } });
  await prisma.$disconnect();
});

describe("lockdown do painel — CLIENT negado, OWNER admitido", () => {
  it("createService", async () => {
    actAs(CLIENT_ID);
    await expect(
      createService({ name: `${PREFIX}new`, price: "40.00", durationMinutes: 30 }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(
      createService({ name: `${PREFIX}new`, price: "40.00", durationMinutes: 30 }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("updateService", async () => {
    actAs(CLIENT_ID);
    await expect(
      updateService({ serviceId: targetServiceId, price: "55.00" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(
      updateService({ serviceId: targetServiceId, price: "55.00" }),
    ).resolves.toEqual({ ok: true });
  });

  it("deactivateService", async () => {
    actAs(CLIENT_ID);
    await expect(deactivateService({ serviceId: targetServiceId })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    actAs(OWNER_ID);
    await expect(deactivateService({ serviceId: targetServiceId })).resolves.toEqual({ ok: true });
  });

  it("reactivateService", async () => {
    // Alvo inativo para reativar.
    await prisma.service.update({
      where: { id: targetServiceId },
      data: { isActive: false },
    });

    actAs(CLIENT_ID);
    await expect(reactivateService({ serviceId: targetServiceId })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    actAs(OWNER_ID);
    await expect(reactivateService({ serviceId: targetServiceId })).resolves.toEqual({ ok: true });
  });

  it("setOpeningHours", async () => {
    actAs(CLIENT_ID);
    await expect(
      setOpeningHours({ weekday: TEST_WEEKDAY, opensAtMinutes: 540, closesAtMinutes: 1080 }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(
      setOpeningHours({ weekday: TEST_WEEKDAY, opensAtMinutes: 540, closesAtMinutes: 1080 }),
    ).resolves.toEqual({ ok: true });
  });

  it("closeDay", async () => {
    actAs(CLIENT_ID);
    await expect(closeDay({ weekday: TEST_WEEKDAY })).rejects.toBeInstanceOf(ForbiddenError);

    actAs(OWNER_ID);
    await expect(closeDay({ weekday: TEST_WEEKDAY })).resolves.toEqual({ ok: true });
  });
});
