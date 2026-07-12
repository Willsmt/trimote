import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { ReactElement } from "react";

// Controla o usuário logado (getCurrentUser) e o hint de negócio ativo (readActiveBusinessHint), já
// que fora de request context cookies() lança e o hint real seria sempre null. resolveActiveBusiness
// permanece REAL (bate no banco) — mockamos só a leitura do hint da sessão.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));
const hintState = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

vi.mock("@/server/business/active-business", async (importActual) => {
  const actual = await importActual<typeof import("@/server/business/active-business")>();
  return {
    ...actual,
    readActiveBusinessHint: async () => hintState.value,
  };
});

import { prisma } from "@/server/db/client";
import OwnerLayout from "@/app/(site)/owner/layout";
import { BusinessSwitcher } from "@/components/owner/business-switcher";
import {
  createTestBusiness,
  addMembership,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "./fixtures";

// Regressão do smoke T044 (fix 007, BUG 1): o BusinessSwitcher só existia em /owner/finance. Agora ele
// vive no LAYOUT compartilhado das rotas de dono (src/app/owner/layout.tsx), então TODA página de dono
// o herda. Renderiza quando há negócio ATIVO (oculto p/ 1 vínculo pelo próprio switcher); em
// needs_selection a tela de seleção já cobre a escolha, então o layout não duplica o seletor.
const OWNER_ID = "u-layout-owner";
const BIZ_A = "biz-layout-a";
const BIZ_B = "biz-layout-b";
const MARKER = "children-marker";

function actAs(userId: string | null) {
  mockState.userId = userId;
}

function findElementOfType(node: unknown, type: unknown): ReactElement | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementOfType(child, type);
      if (found) return found;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) return el as ReactElement;
  return findElementOfType(el.props?.children, type);
}

beforeAll(async () => {
  await upsertUser({ id: OWNER_ID, email: "layout-owner@example.com", role: "CLIENT" });
  await createTestBusiness({ id: BIZ_A, name: "Alpha", slug: "layout-a" });
  await createTestBusiness({ id: BIZ_B, name: "Bravo", slug: "layout-b" });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_A, createdBy: OWNER_ID });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_B, createdBy: OWNER_ID });
});

afterAll(async () => {
  actAs(null);
  hintState.value = null;
  await cleanupMembershipsAndSessions([OWNER_ID]);
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

describe("layout de dono renderiza o switcher em todas as áreas (BUG 1)", () => {
  it("dono com 2 vínculos e negócio ativo → layout injeta o switcher com os 2 negócios", async () => {
    actAs(OWNER_ID);
    hintState.value = BIZ_A; // negócio ativo escolhido
    const tree = await OwnerLayout({ children: MARKER });
    const switcher = findElementOfType(tree, BusinessSwitcher);
    expect(switcher).not.toBeNull();
    const props = switcher!.props as {
      businesses: { id: string }[];
      activeBusinessId: string | null;
    };
    expect(props.businesses.map((b) => b.id).sort()).toEqual([BIZ_A, BIZ_B]);
    expect(props.activeBusinessId).toBe(BIZ_A);
  });

  it("dono sem negócio ativo (needs_selection) → layout NÃO duplica o seletor", async () => {
    actAs(OWNER_ID);
    hintState.value = null; // 2 vínculos, nenhum ativo → a tela de seleção da página cobre a escolha
    const tree = await OwnerLayout({ children: MARKER });
    expect(findElementOfType(tree, BusinessSwitcher)).toBeNull();
  });
});
