import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import { formatBRL } from "@/domain/money";

// Intl.NumberFormat("pt-BR", {style:"currency"}) usa NBSP (U+00A0) entre "R$" e o número, não
// espaço comum (U+0020) — mesmo caractere que os outros 4 lugares já produzem, só que aqui é a
// PRIMEIRA vez que alguém compara a string exata; sem isso o literal "R$ 45,00" (espaço comum) não
// bate por Object.is apesar de visualmente idêntico.
const NBSP = "\u00A0";

/**
 * Unit (domínio puro) da formatação de moeda (issue #56). Mesma locale/style/currency já usada
 * inline em page.tsx e nos outros 4 lugares (Intl.NumberFormat("pt-BR", {style:"currency",
 * currency:"BRL"})) — aqui só o util extraído, sem mudar comportamento.
 */
describe("formatBRL", () => {
  it("número inteiro -> centavos .00 (45 -> R$ 45,00)", () => {
    expect(formatBRL(45)).toBe(`R$${NBSP}45,00`);
  });

  it("centavos quebrados (4.5 -> R$ 4,50)", () => {
    expect(formatBRL(4.5)).toBe(`R$${NBSP}4,50`);
  });

  it("aceita Prisma.Decimal diretamente", () => {
    expect(formatBRL(new Prisma.Decimal("4.50"))).toBe(`R$${NBSP}4,50`);
  });
});
