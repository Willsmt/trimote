import { describe, it, expect } from "vitest";
import {
  localDateTimeToUtc,
  utcToLocalMinutes,
  weekdayInZone,
  todayInZone,
} from "@/domain/time";

// Camada única de tempo (Princípio VII / FR-014): armazenamento em UTC, cálculo em
// America/Sao_Paulo. Os testes fixam o fuso explicitamente e NÃO dependem do fuso do servidor.
const SP = "America/Sao_Paulo";

describe("localDateTimeToUtc", () => {
  it("converte hora local (09:00 SP) para o instante UTC correto", () => {
    // 2026-07-01 09:00 em São Paulo (UTC-3) => 12:00Z
    const instant = localDateTimeToUtc("2026-07-01", 9 * 60, SP);
    expect(instant.toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  it("converte meia-noite local para 03:00Z", () => {
    const instant = localDateTimeToUtc("2026-07-01", 0, SP);
    expect(instant.toISOString()).toBe("2026-07-01T03:00:00.000Z");
  });
});

describe("utcToLocalMinutes", () => {
  it("é o inverso de localDateTimeToUtc (round-trip)", () => {
    const minutes = 9 * 60 + 30; // 09:30
    const instant = localDateTimeToUtc("2026-07-01", minutes, SP);
    expect(utcToLocalMinutes(instant, SP)).toBe(minutes);
  });

  it("usa o fuso informado, não o do servidor", () => {
    // 2026-07-02T01:00:00Z => 2026-07-01 22:00 em São Paulo => 1320 min
    const instant = new Date("2026-07-02T01:00:00.000Z");
    expect(utcToLocalMinutes(instant, SP)).toBe(22 * 60);
  });
});

describe("weekdayInZone", () => {
  it("retorna 0=domingo..6=sábado conforme o fuso (2026-07-01 = quarta = 3)", () => {
    const instant = localDateTimeToUtc("2026-07-01", 9 * 60, SP);
    expect(weekdayInZone(instant, SP)).toBe(3);
  });

  it("respeita a virada de dia do fuso local", () => {
    // Instante que ainda é 2026-07-01 (quarta) em SP, embora 2026-07-02 em UTC.
    const instant = new Date("2026-07-02T01:00:00.000Z");
    expect(weekdayInZone(instant, SP)).toBe(3);
  });
});

describe("todayInZone", () => {
  it("retorna a data local YYYY-MM-DD do instante no fuso", () => {
    const now = new Date("2026-07-02T01:00:00.000Z"); // 2026-07-01 22:00 em SP
    expect(todayInZone(now, SP)).toBe("2026-07-01");
  });
});
