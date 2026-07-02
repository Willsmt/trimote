import { Prisma } from "@prisma/client";

/**
 * Helper puro de itens de lançamento (005-financial-ledger). SEM dependência de Prisma Client/banco:
 * recebe preços já resolvidos (o snapshot é lido do serviço pela camada de captura, dentro da
 * transação). Concentra a soma exata e a validação de positividade (FR-007/FR-011), testável
 * isoladamente (Princípio IV). Dinheiro em `Prisma.Decimal` — nunca float (Princípio II).
 */

export interface LedgerItemInput {
  /** Serviço do catálogo (snapshot) ou `null` para extra manual (US2). */
  serviceId: string | null;
  description: string;
  /** Valor do item — sempre positivo (FR-011). Para item de serviço, é o snapshot do preço. */
  amount: Prisma.Decimal;
}

/**
 * Constrói um item a partir de um preço já resolvido (snapshot — FR-002). O valor congela aqui: uma
 * mudança futura no preço do serviço não afeta o item.
 */
export function buildServiceItem(input: {
  serviceId: string;
  description: string;
  price: Prisma.Decimal;
}): LedgerItemInput {
  return { serviceId: input.serviceId, description: input.description, amount: input.price };
}

/** Soma exata dos valores dos itens (base do `LedgerEntry.amount` de receita — FR-007). */
export function sumItems(items: LedgerItemInput[]): Prisma.Decimal {
  return items.reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0));
}

/** Verdadeiro se todos os itens têm `amount > 0` (FR-011). */
export function allAmountsPositive(items: LedgerItemInput[]): boolean {
  return items.every((item) => item.amount.greaterThan(0));
}

/**
 * Normaliza uma descrição informada por humano (despesa, item/extra manual). Aplica trim e rejeita o
 * que sobra vazio: devolve o valor sem espaços nas pontas, ou `null` se ficar em branco. Ponto único
 * da regra `invalid_description` — os três fluxos de captura herdam (despesa, walk-in, conclusão).
 */
export function normalizeDescription(description: string): string | null {
  const trimmed = description.trim();
  return trimmed === "" ? null : trimmed;
}
