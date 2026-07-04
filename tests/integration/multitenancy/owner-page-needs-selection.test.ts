import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { ReactElement } from "react";

// Controla o usuário "logado" via mock da camada de sessão (vi.hoisted evita TDZ no factory),
// mesmo padrão de lockdown.test.ts. Sem sessão criada → readActiveBusinessHint devolve null (fora de
// request context, cookies() lança e o hint tolera → null), então o hint do negócio ativo é NULL.
const mockState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/server/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => (mockState.userId ? { id: mockState.userId } : null),
  };
});

import { prisma } from "@/server/db/client";
import { requireOwner, NeedsBusinessSelectionError } from "@/server/auth/owner";
import { BusinessSelectionScreen } from "@/components/owner/business-selection-screen";
import OwnerHomePage from "@/app/owner/page";
import OwnerFinancePage from "@/app/owner/finance/page";
import {
  createTestBusiness,
  addMembership,
  upsertUser,
  cleanupBusinesses,
  cleanupMembershipsAndSessions,
} from "./fixtures";

// Regressão do smoke T044 (fix 007): dono com 2+ negócios SEM negócio ativo na sessão NÃO pode cair
// em exceção não capturada (error screen do Next). O estado needs_selection é UI: as páginas de dono
// devem RENDERIZAR a tela de seleção (BusinessSelectionScreen), não explodir. O estado empty
// (0 negócios) continua sendo um redirect (não é dono) — também sem deadlock.
const OWNER_ID = "u-needsel-owner";
const CLIENT_ID = "u-needsel-client";
const BIZ_A = "biz-needsel-a";
const BIZ_B = "biz-needsel-b";

function actAs(userId: string | null) {
  mockState.userId = userId;
}

// Percorre a árvore de elementos React (objetos { type, props }) procurando um nó de dado tipo.
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
  await upsertUser({ id: OWNER_ID, email: "needsel-owner@example.com", role: "CLIENT" });
  await upsertUser({ id: CLIENT_ID, email: "needsel-client@example.com", role: "CLIENT" });
  await createTestBusiness({ id: BIZ_A, name: "Alpha", slug: "needsel-a" });
  await createTestBusiness({ id: BIZ_B, name: "Bravo", slug: "needsel-b" });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_A, createdBy: OWNER_ID });
  await addMembership({ userId: OWNER_ID, businessId: BIZ_B, createdBy: OWNER_ID });
});

afterAll(async () => {
  actAs(null);
  await cleanupMembershipsAndSessions([OWNER_ID, CLIENT_ID]);
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, CLIENT_ID] } } });
  await prisma.$disconnect();
});

describe("needs_selection é estado de UI, não exceção (smoke T044)", () => {
  it("requireOwner lança NeedsBusinessSelectionError CARREGANDO as opções do dono", async () => {
    actAs(OWNER_ID);
    try {
      await requireOwner();
      throw new Error("esperava NeedsBusinessSelectionError");
    } catch (error) {
      expect(error).toBeInstanceOf(NeedsBusinessSelectionError);
      const options = (error as NeedsBusinessSelectionError).options;
      expect(options.map((o) => o.businessId).sort()).toEqual([BIZ_A, BIZ_B]);
    }
  });

  it("/owner renderiza a tela de seleção (não lança) para dono com 2 vínculos sem ativo", async () => {
    actAs(OWNER_ID);
    const tree = await OwnerHomePage();
    const screen = findElementOfType(tree, BusinessSelectionScreen);
    expect(screen).not.toBeNull();
    expect((screen!.props as { options: unknown[] }).options).toHaveLength(2);
  });

  it("/owner/finance renderiza a tela de seleção (não lança) para dono com 2 vínculos sem ativo", async () => {
    actAs(OWNER_ID);
    const tree = await OwnerFinancePage({ searchParams: Promise.resolve({}) });
    const screen = findElementOfType(tree, BusinessSelectionScreen);
    expect(screen).not.toBeNull();
    expect((screen!.props as { options: unknown[] }).options).toHaveLength(2);
  });

  it("estado empty (0 negócios) redireciona — não deadlock nem tela de seleção", async () => {
    actAs(CLIENT_ID);
    // redirect() lança um erro com digest NEXT_REDIRECT; confirma que empty é tratado (bounce),
    // não uma NeedsBusinessSelectionError nem uma exceção de aplicação não capturada.
    let thrown: unknown;
    try {
      await OwnerHomePage();
      throw new Error("esperava redirect (NEXT_REDIRECT)");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeInstanceOf(NeedsBusinessSelectionError);
    expect((thrown as { digest?: string })?.digest ?? "").toMatch(/^NEXT_REDIRECT/);
  });
});
