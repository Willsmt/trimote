import { describe, it, expect } from "vitest";
import { computeAvailableSlots, type AvailabilityInput } from "@/domain/availability";
import { localDateTimeToUtc } from "@/domain/time";

// Lógica de disponibilidade — pura, sem I/O (FR-003..FR-006). Tudo calculado em America/Sao_Paulo,
// instantes em UTC. Datas: 2026-07-01 é uma quarta-feira (com expediente).
const SP = "America/Sao_Paulo";
const DATE = "2026-07-01";

// Helpers de legibilidade.
const at = (minutes: number) => localDateTimeToUtc(DATE, minutes, SP);
const iso = (slots: Date[]) => slots.map((d) => d.toISOString());

// "now" bem no passado para que nada seja filtrado como passado, salvo nos testes específicos.
const PAST = new Date("2026-01-01T00:00:00.000Z");

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: DATE,
    timeZone: SP,
    openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60 },
    durationMinutes: 30,
    activeBookings: [],
    slotStepMinutes: 30,
    now: PAST,
    ...overrides,
  };
}

describe("computeAvailableSlots", () => {
  it("gera slots no passo definido dentro do expediente", () => {
    const slots = computeAvailableSlots(
      baseInput({ openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 + 30 } }),
    );
    // 09:00, 09:30, 10:00 (10:00+30 = 10:30 = fechamento, cabe).
    expect(iso(slots)).toEqual(iso([at(9 * 60), at(9 * 60 + 30), at(10 * 60)]));
  });

  it("não oferece slot cujo fim ultrapasse o fechamento (FR-004/FR-005)", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 },
        durationMinutes: 45,
        slotStepMinutes: 30,
      }),
    );
    // 09:00 (fim 09:45, ok). 09:30 (fim 10:15 > 10:00, excluído).
    expect(iso(slots)).toEqual(iso([at(9 * 60)]));
  });

  it("retorna vazio em dia sem expediente (FR-005)", () => {
    const slots = computeAvailableSlots(baseInput({ openingHours: null }));
    expect(slots).toEqual([]);
  });

  it("não oferece slots no passado (FR-006)", () => {
    // now = 2026-07-01 09:15 SP => 09:00 é passado; 09:30 em diante é futuro.
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 + 30 },
        now: localDateTimeToUtc(DATE, 9 * 60 + 15, SP),
      }),
    );
    expect(iso(slots)).toEqual(iso([at(9 * 60 + 30), at(10 * 60)]));
  });

  it("remove slot que colide com agendamento ativo", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 11 * 60 },
        activeBookings: [{ startsAt: at(9 * 60), endsAt: at(9 * 60 + 30) }],
      }),
    );
    // 09:00 removido pela colisão; restam 09:30, 10:00, 10:30.
    expect(iso(slots)).toEqual(iso([at(9 * 60 + 30), at(10 * 60), at(10 * 60 + 30)]));
  });

  it("mantém slot adjacente a um agendamento (intervalo semiaberto '[)')", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 + 30 },
        activeBookings: [{ startsAt: at(9 * 60), endsAt: at(9 * 60 + 30) }],
      }),
    );
    // Booking 09:00–09:30. Slot 09:30 começa exatamente no fim => adjacência válida, permanece.
    expect(iso(slots)).toContain(at(9 * 60 + 30).toISOString());
    expect(iso(slots)).not.toContain(at(9 * 60).toISOString());
  });
});
