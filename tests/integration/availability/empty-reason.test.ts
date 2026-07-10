import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { getAvailableSlots } from "@/server/actions/get-available-slots";
import {
  BUSINESS_ID,
  SERVICE_CORTE,
  cleanupBookings,
  slotAt,
  teardownUsers,
  upsertUsers,
} from "../reschedule/fixtures";

// Integração (Postgres) do emptyReason (issue #22): distinguir dia FECHADO (weekday sem OpeningHours)
// de dia com expediente mas SEM horário livre. Reusa as fixtures do negócio semeado (expediente
// seg–sáb 09:00–18:00; domingo sem linha => fechado) — mesmo padrão de exclude-self.test.ts.
// Datas exclusivas deste arquivo (evita colisão da exclusion constraint entre suítes paralelas):
const DATE_CLOSED = "2026-12-06"; // domingo — sem OpeningHours no seed
const DATE_FULL = "2026-12-07"; // segunda — expediente aberto, dia inteiro ocupado
const DATE_FREE = "2026-12-08"; // terça — expediente aberto, sem agendamentos
const USER = "u-it-avail-reason";

beforeAll(async () => {
  await upsertUsers([{ id: USER, email: "avail-reason@example.com" }]);
  // Um único booking ACTIVE cobrindo o expediente inteiro (09:00–18:00) lota DATE_FULL: nenhum slot
  // livre, mas o dia TEM expediente — o caso 'no_slots'. Inserido direto (bypassa as guardas do core).
  await prisma.booking.create({
    data: {
      businessId: BUSINESS_ID,
      userId: USER,
      serviceId: SERVICE_CORTE,
      startsAt: slotAt(DATE_FULL, 9 * 60),
      endsAt: slotAt(DATE_FULL, 18 * 60),
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await cleanupBookings([USER]);
  await teardownUsers([USER]);
});

describe("getAvailableSlots — emptyReason (issue #22)", () => {
  it("domingo (sem OpeningHours) → slots vazio com emptyReason 'closed'", async () => {
    const result = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE_CLOSED });
    if (!result.ok) throw new Error("disponibilidade falhou");
    expect(result.slots).toEqual([]);
    expect(result.emptyReason).toBe("closed");
  });

  it("dia útil com expediente lotado → slots vazio com emptyReason 'no_slots'", async () => {
    const result = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE_FULL });
    if (!result.ok) throw new Error("disponibilidade falhou");
    expect(result.slots).toEqual([]);
    expect(result.emptyReason).toBe("no_slots");
  });

  it("dia útil com horários livres → emptyReason ausente", async () => {
    const result = await getAvailableSlots({ serviceId: SERVICE_CORTE, date: DATE_FREE });
    if (!result.ok) throw new Error("disponibilidade falhou");
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.emptyReason).toBeUndefined();
  });
});
