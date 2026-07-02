import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import {
  buildServiceItem,
  sumItems,
  allAmountsPositive,
  normalizeDescription,
  type LedgerItemInput,
} from "@/server/ledger/ledger-items";

// Teste unitário (sem banco) do helper puro de itens (005-financial-ledger).
// Cobre: snapshot de preço, soma exata dos itens e validação de positividade (FR-007/FR-011/SC-005).
// Dinheiro em Prisma.Decimal (nunca float — Princípio II).

const D = (v: string | number) => new Prisma.Decimal(v);

describe("buildServiceItem (snapshot de preço)", () => {
  it("congela o preço fornecido no item (amount == price), mantendo serviceId e descrição", () => {
    const item = buildServiceItem({
      serviceId: "service-corte",
      description: "Corte",
      price: D("40.00"),
    });
    expect(item.serviceId).toBe("service-corte");
    expect(item.description).toBe("Corte");
    expect(item.amount.equals(D("40.00"))).toBe(true);
  });
});

describe("sumItems (soma exata dos itens)", () => {
  it("soma valores decimais sem erro de ponto flutuante", () => {
    const items: LedgerItemInput[] = [
      { serviceId: "service-corte", description: "Corte", amount: D("40.10") },
      { serviceId: null, description: "Gorjeta", amount: D("0.20") },
      { serviceId: "service-barba", description: "Barba", amount: D("30.05") },
    ];
    // 40.10 + 0.20 + 30.05 = 70.35 (float daria 70.34999...).
    expect(sumItems(items).equals(D("70.35"))).toBe(true);
  });

  it("soma de lista vazia é 0", () => {
    expect(sumItems([]).equals(D(0))).toBe(true);
  });

  it("o total do lançamento é exatamente a soma dos itens (SC-005)", () => {
    const items: LedgerItemInput[] = [
      { serviceId: "service-corte", description: "Corte", amount: D("40.00") },
      { serviceId: null, description: "Extra", amount: D("15.00") },
    ];
    const total = sumItems(items);
    expect(total.equals(D("55.00"))).toBe(true);
  });
});

describe("allAmountsPositive (rejeição de valor <= 0 — FR-011)", () => {
  it("true quando todos os itens têm amount > 0", () => {
    const items: LedgerItemInput[] = [
      { serviceId: null, description: "A", amount: D("1.00") },
      { serviceId: null, description: "B", amount: D("0.01") },
    ];
    expect(allAmountsPositive(items)).toBe(true);
  });

  it("false quando algum item tem amount == 0", () => {
    const items: LedgerItemInput[] = [
      { serviceId: null, description: "A", amount: D("10.00") },
      { serviceId: null, description: "Zero", amount: D("0") },
    ];
    expect(allAmountsPositive(items)).toBe(false);
  });

  it("false quando algum item tem amount negativo", () => {
    const items: LedgerItemInput[] = [
      { serviceId: null, description: "Neg", amount: D("-5.00") },
    ];
    expect(allAmountsPositive(items)).toBe(false);
  });
});

describe("normalizeDescription (rejeição de descrição vazia — invalid_description)", () => {
  it("devolve o valor com trim quando há conteúdo", () => {
    expect(normalizeDescription("  Aluguel  ")).toBe("Aluguel");
  });

  it("null quando vazia", () => {
    expect(normalizeDescription("")).toBeNull();
  });

  it("null quando só espaços", () => {
    expect(normalizeDescription("   ")).toBeNull();
  });
});
