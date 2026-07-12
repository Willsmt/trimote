import { describe, it, expect } from "vitest";

import { normalizePhoneBR, isValidPhoneBR } from "@/domain/phone";

/**
 * Unit (domínio puro) da validação/normalização de celular BR (issue #34). E.164 como forma canônica.
 *
 * TEST-FIRST (RED por AUSÊNCIA da função — o core é um stub que lança "not implemented"). O módulo
 * importa limpo; os casos falham por comportamento até o GREEN.
 */

const E164 = "+5511999999999";

describe("normalizePhoneBR / isValidPhoneBR (issue #34)", () => {
  it("máscara BR (11) 99999-9999 → E.164 +5511999999999", () => {
    expect(normalizePhoneBR("(11) 99999-9999")).toBe(E164);
    expect(isValidPhoneBR("(11) 99999-9999")).toBe(true);
  });

  it("já em E.164 (+55...) é idempotente", () => {
    expect(normalizePhoneBR(E164)).toBe(E164);
  });

  it("DDD inválido (10) → null", () => {
    expect(normalizePhoneBR("(10) 99999-9999")).toBeNull();
    expect(isValidPhoneBR("(10) 99999-9999")).toBe(false);
  });

  it("fixo / menos de 11 dígitos → null", () => {
    expect(normalizePhoneBR("(11) 3333-4444")).toBeNull(); // fixo: 10 dígitos, 3º dígito != 9
    expect(normalizePhoneBR("11 99999")).toBeNull(); // curto demais
  });

  it("lixo / vazio → null", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("abc-não-é-telefone")).toBeNull();
  });

  it("o MESMO número em formatações variadas → a mesma saída E.164", () => {
    const variações = [
      "(11) 99999-9999",
      "11 99999 9999",
      "11999999999",
      "+55 11 99999-9999",
      "5511999999999",
    ];
    for (const v of variações) {
      expect(normalizePhoneBR(v)).toBe(E164);
    }
  });
});
