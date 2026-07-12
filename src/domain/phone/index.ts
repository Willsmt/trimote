/**
 * Validação e normalização de telefone celular brasileiro (issue #34). Domínio puro e testável
 * (espelha src/domain/time): sem lib externa, só regex + regra de DDD/9º dígito.
 *
 * Formato canônico de armazenamento: E.164 (`+55` + 11 dígitos nacionais). Celular BR = DDD (2) + 9
 * (marcador de móvel) + 8 dígitos. A camada de apresentação aplica máscara; o banco guarda E.164.
 */

/** DDDs válidos no Brasil (ANATEL). Números fora desta lista são recusados. */
const VALID_DDD = new Set<string>([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Normaliza um telefone BR para E.164 (`+55DDDNXXXXXXXX`) ou devolve `null` se não for um celular BR
 * válido. Idempotente: um E.164 já correto volta igual. Aceita formatações variadas (máscara,
 * espaços, +55) — todas colapsam na mesma saída.
 */
export function normalizePhoneBR(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");

  // Desambiguação por COMPRIMENTO, nunca por prefixo: 13 dígitos = código do país (55) + 11 nacionais;
  // 11 dígitos = já nacional (o DDD pode ser 55, ex.: RS/Santa Maria — remover "55" por prefixo
  // mutilaria esse número). Qualquer outro comprimento não é celular BR.
  let national: string;
  if (digits.length === 13 && digits.startsWith("55")) {
    national = digits.slice(2);
  } else if (digits.length === 11) {
    national = digits;
  } else {
    return null;
  }

  // DDD válido (ANATEL) e 3º dígito nacional = 9 (marcador de celular). Fixo (sem o 9) fica de fora
  // por propósito — o escopo é WhatsApp/celular.
  const ddd = national.slice(0, 2);
  if (!VALID_DDD.has(ddd)) return null;
  if (national[2] !== "9") return null;

  return `+55${national}`;
}

/** Conveniência booleana: é um celular BR válido? Deriva de normalizePhoneBR (fonte única da regra). */
export function isValidPhoneBR(input: string): boolean {
  return normalizePhoneBR(input) !== null;
}
