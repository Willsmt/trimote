import { Prisma } from "@prisma/client";

/**
 * Formatação de moeda BRL (issue #56). Mesma locale/style/currency já usada inline em cinco
 * lugares do projeto (page.tsx e componentes do financeiro) — aqui extraída pra código NOVO
 * reusar; os cinco lugares existentes permanecem como estão (fora de escopo).
 */
export function formatBRL(value: Prisma.Decimal | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value),
  );
}
