import { describe, it, expect } from "vitest";

import HomePage from "@/app/(marketing)/page";

// Não-regressão do smoke T044 (fix 007, BUG 2): pós-T036a /services foi removida e /booking virou
// redirect. A home NÃO pode linkar para essas rotas mortas (cliente cairia em loop/404). O acesso a
// cada barbearia é pelo link/QR próprio (/b/[slug]); a home não vira listagem/marketplace (fora do
// escopo F007). Este teste guarda contra a reintrodução de CTAs órfãos.

// Coleta todos os hrefs da árvore de elementos React (objetos { type, props }).
function collectHrefs(node: unknown, acc: string[]): void {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectHrefs(child, acc);
    return;
  }
  const el = node as { props?: { href?: unknown; children?: unknown } };
  if (typeof el.props?.href === "string") acc.push(el.props.href);
  collectHrefs(el.props?.children, acc);
}

describe("home sem CTAs órfãos (BUG 2)", () => {
  it("não linka para rotas removidas (/services, /booking)", () => {
    const tree = HomePage();
    const hrefs: string[] = [];
    collectHrefs(tree, hrefs);
    const dead = hrefs.filter((h) => h.startsWith("/services") || h.startsWith("/booking"));
    expect(dead).toEqual([]);
  });
});
