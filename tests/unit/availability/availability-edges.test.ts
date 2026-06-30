import { describe, it, expect } from "vitest";
import { computeAvailableSlots, type AvailabilityInput } from "@/domain/availability";
import { localDateTimeToUtc } from "@/domain/time";

// Bordas adicionais de disponibilidade (complementa availability.test.ts).
const SP = "America/Sao_Paulo";
const DATE = "2026-07-01";
const at = (minutes: number) => localDateTimeToUtc(DATE, minutes, SP);
const iso = (slots: Date[]) => slots.map((d) => d.toISOString());
const PAST = new Date("2026-01-01T00:00:00.000Z");

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: DATE,
    timeZone: SP,
    openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60 },
    durationMinutes: 30,
    activeBookings: [],
    now: PAST,
    ...overrides,
  };
}

describe("computeAvailableSlots — bordas adicionais", () => {
  it("usa o passo default de 30 min quando slotStepMinutes é omitido", () => {
    const slots = computeAvailableSlots(
      baseInput({ openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 11 * 60 } }),
    );
    expect(iso(slots)).toEqual(iso([at(9 * 60), at(9 * 60 + 30), at(10 * 60), at(10 * 60 + 30)]));
  });

  it("retorna vazio quando a duração não cabe na janela", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 },
        durationMinutes: 90,
      }),
    );
    expect(slots).toEqual([]);
  });

  it("oferece um único slot quando o serviço preenche exatamente a janela", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 },
        durationMinutes: 60,
      }),
    );
    expect(iso(slots)).toEqual(iso([at(9 * 60)]));
  });

  it("exclui o slot cujo início é exatamente 'now' (limite do passado)", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 10 * 60 + 30 },
        now: at(9 * 60), // exatamente o início do slot das 09:00
      }),
    );
    expect(iso(slots)).toEqual(iso([at(9 * 60 + 30), at(10 * 60)]));
  });

  it("remove vários slots quando há múltiplos agendamentos ativos", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 11 * 60 },
        activeBookings: [
          { startsAt: at(9 * 60), endsAt: at(9 * 60 + 30) },
          { startsAt: at(10 * 60), endsAt: at(10 * 60 + 30) },
        ],
      }),
    );
    // Restam 09:30 e 10:30.
    expect(iso(slots)).toEqual(iso([at(9 * 60 + 30), at(10 * 60 + 30)]));
  });

  it("retorna vazio quando um agendamento cobre toda a janela", () => {
    const slots = computeAvailableSlots(
      baseInput({
        openingHours: { opensAtMinutes: 9 * 60, closesAtMinutes: 11 * 60 },
        activeBookings: [{ startsAt: at(9 * 60), endsAt: at(11 * 60) }],
      }),
    );
    expect(slots).toEqual([]);
  });
});
