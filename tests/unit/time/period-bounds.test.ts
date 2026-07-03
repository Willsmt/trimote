import { describe, it, expect } from "vitest";

import { periodBoundsInZone, shiftPeriod } from "@/domain/time";

// Teste unitário (sem banco) dos limites de período no fuso da barbearia (006-financial-reports).
// A bucketização do caixa/breakdown é por range em UTC [início, fim) derivado no fuso; a semana é
// ISO (segunda). Cobre FR-002/FR-003 e a borda de fuso (SC-003). SP = UTC-3 (sem DST desde 2019).
const SP = "America/Sao_Paulo";
const iso = (d: Date) => d.toISOString();

describe("periodBoundsInZone — range [startUtc, endUtc) no fuso da barbearia", () => {
  it("dia: 2026-07-13 (SP) => [00:00 local, +1 dia) em UTC (UTC-3)", () => {
    const { startUtc, endUtc } = periodBoundsInZone("2026-07-13", "day", SP);
    expect(iso(startUtc)).toBe("2026-07-13T03:00:00.000Z");
    expect(iso(endUtc)).toBe("2026-07-14T03:00:00.000Z");
  });

  it("semana ISO (segunda): referência de quarta cai na semana que começa na segunda 2026-07-13", () => {
    // 2026-07-15 é quarta; 2026-07-13 é segunda (2026-07-05 é domingo).
    const { startUtc, endUtc } = periodBoundsInZone("2026-07-15", "week", SP);
    expect(iso(startUtc)).toBe("2026-07-13T03:00:00.000Z");
    expect(iso(endUtc)).toBe("2026-07-20T03:00:00.000Z");
  });

  it("mês: 2026-07-15 => [01/07, 01/08) local em UTC", () => {
    const { startUtc, endUtc } = periodBoundsInZone("2026-07-15", "month", SP);
    expect(iso(startUtc)).toBe("2026-07-01T03:00:00.000Z");
    expect(iso(endUtc)).toBe("2026-08-01T03:00:00.000Z");
  });

  it("ano: 2026-07-15 => [01/01/2026, 01/01/2027) local em UTC", () => {
    const { startUtc, endUtc } = periodBoundsInZone("2026-07-15", "year", SP);
    expect(iso(startUtc)).toBe("2026-01-01T03:00:00.000Z");
    expect(iso(endUtc)).toBe("2027-01-01T03:00:00.000Z");
  });

  it("borda de fuso (SC-003): 22:30 local de 13/07 (= 2026-07-14T01:30Z) pertence ao dia 13/07", () => {
    const { startUtc, endUtc } = periodBoundsInZone("2026-07-13", "day", SP);
    const occurredAt = new Date("2026-07-14T01:30:00.000Z"); // 22:30 de 13/07 em SP
    expect(occurredAt >= startUtc && occurredAt < endUtc).toBe(true);
    // e NÃO pertence ao dia 14/07
    const next = periodBoundsInZone("2026-07-14", "day", SP);
    expect(occurredAt >= next.startUtc && occurredAt < next.endUtc).toBe(false);
  });
});

describe("shiftPeriod — navegação anterior/próximo mantendo a granularidade", () => {
  it("mês: próximo e anterior", () => {
    expect(shiftPeriod("2026-07-15", "month", 1)).toBe("2026-08-15");
    expect(shiftPeriod("2026-07-15", "month", -1)).toBe("2026-06-15");
  });

  it("semana: ±7 dias", () => {
    expect(shiftPeriod("2026-07-15", "week", 1)).toBe("2026-07-22");
    expect(shiftPeriod("2026-07-15", "week", -1)).toBe("2026-07-08");
  });

  it("dia e ano", () => {
    expect(shiftPeriod("2026-07-15", "day", 1)).toBe("2026-07-16");
    expect(shiftPeriod("2026-07-15", "year", -1)).toBe("2025-07-15");
  });
});
