import { describe, it, expect } from "vitest";
import {
  localDateTimeToUtc,
  utcToLocalMinutes,
  weekdayInZone,
  todayInZone,
} from "@/domain/time";

// Bordas adicionais da camada de tempo (complementa time.test.ts).
const SP = "America/Sao_Paulo";

describe("weekdayInZone — limites de fim de semana", () => {
  it("identifica domingo como 0 (2026-07-05)", () => {
    expect(weekdayInZone(localDateTimeToUtc("2026-07-05", 9 * 60, SP), SP)).toBe(0);
  });

  it("identifica sábado como 6 (2026-07-04)", () => {
    expect(weekdayInZone(localDateTimeToUtc("2026-07-04", 9 * 60, SP), SP)).toBe(6);
  });
});

describe("round-trip em horários extremos do dia", () => {
  it("preserva 23:59 local na conversão de ida e volta", () => {
    const minutes = 23 * 60 + 59;
    const instant = localDateTimeToUtc("2026-07-01", minutes, SP);
    expect(utcToLocalMinutes(instant, SP)).toBe(minutes);
  });
});

describe("todayInZone — meia-noite local", () => {
  it("retorna a própria data quando o instante é a meia-noite local", () => {
    const midnight = localDateTimeToUtc("2026-07-01", 0, SP);
    expect(todayInZone(midnight, SP)).toBe("2026-07-01");
  });
});
