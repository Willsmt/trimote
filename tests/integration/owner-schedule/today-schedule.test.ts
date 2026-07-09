import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db/client";
import { listTodayScheduleForOwner } from "@/server/booking/list-today-schedule";
import { localDateTimeToUtc } from "@/domain/time";
import { createTestBusiness, upsertUser, cleanupBusinesses } from "../multitenancy/fixtures";
import { seedBooking } from "../ledger/fixtures";

// Integracao: AGENDA DO DIA do dono (issue #13, parte c). O core recebe businessId + timeZone (que a
// pagina deriva de requireOwner, NUNCA de input) e devolve os bookings ACTIVE de HOJE no fuso do
// negocio. Dois eixos de garantia: isolamento por negocio e janela do dia [startUtc, endUtc).
const SP = "America/Sao_Paulo";
const BIZ_A = "biz-sched-a";
const BIZ_B = "biz-sched-b";
const SVC_A = "svc-sched-a";
const SVC_B = "svc-sched-b";
const CLIENT_ID = "u-sched-client";
const D = (v: string) => new Prisma.Decimal(v);

beforeAll(async () => {
  await upsertUser({ id: CLIENT_ID, email: "sched-client@example.com", role: "CLIENT" });
  await createTestBusiness({ id: BIZ_A, name: "Sched A", slug: "sched-a" });
  await createTestBusiness({ id: BIZ_B, name: "Sched B", slug: "sched-b" });
  await prisma.service.upsert({
    where: { id: SVC_A },
    update: {},
    create: { id: SVC_A, businessId: BIZ_A, name: "Corte A", price: D("40.00"), durationMinutes: 30 },
  });
  await prisma.service.upsert({
    where: { id: SVC_B },
    update: {},
    create: { id: SVC_B, businessId: BIZ_B, name: "Corte B", price: D("50.00"), durationMinutes: 30 },
  });
});

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { businessId: { in: [BIZ_A, BIZ_B] } } });
});

afterAll(async () => {
  await cleanupBusinesses([BIZ_A, BIZ_B]);
  await prisma.user.deleteMany({ where: { id: CLIENT_ID } });
  await prisma.$disconnect();
});

describe("agenda do dia — isolamento por negocio (issue #13)", () => {
  it("agenda de A retorna SO bookings de A (nunca de B)", async () => {
    const now = localDateTimeToUtc("2035-03-15", 12 * 60, SP); // meio-dia local
    const a1 = await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-03-15", 10 * 60, SP) });
    const a2 = await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-03-15", 11 * 60, SP) });
    const b1 = await seedBooking({ userId: CLIENT_ID, serviceId: SVC_B, startsAt: localDateTimeToUtc("2035-03-15", 10 * 60, SP) });

    const rows = await listTodayScheduleForOwner({ businessId: BIZ_A, timeZone: SP, now });

    const ids = rows.map((r) => r.id);
    expect(ids).toEqual([a1, a2]); // so os de A, ordenados por startsAt
    expect(ids).not.toContain(b1); // nunca os de B
    // sanity do select minimo
    expect(rows[0].serviceName).toBe("Corte A");
    expect(rows[0].status).toBe("ACTIVE");
    expect(rows[0].clientEmail).toBe("sched-client@example.com");
  });
});

describe("agenda do dia — janela do dia no fuso do negocio (issue #13)", () => {
  it("borda de meia-noite: prova [startUtc, endUtc) por FUSO, nao date(startsAt) em UTC", async () => {
    // Sao_Paulo = UTC-3 (sem DST desde 2019). Os casos de borda cruzam o dia em UTC: uma query
    // ingenua (date(startsAt) = hoje em UTC) erraria os dois; so os limites por fuso acertam.
    const now = localDateTimeToUtc("2035-06-20", 12 * 60, SP);
    await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-06-19", 10 * 60, SP) }); // ontem -> fora
    const today = await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-06-20", 10 * 60, SP) }); // hoje -> dentro
    // 23h30 de HOJE em SP = 02h30 de AMANHA em UTC -> DEVE entrar (ainda e hoje no fuso do negocio).
    const todayLateNight = await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-06-20", 23 * 60 + 30, SP) });
    // 00h30 de AMANHA em SP = 03h30 de amanha em UTC -> NAO deve entrar (ja e amanha no fuso).
    await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-06-21", 30, SP) });
    await seedBooking({ userId: CLIENT_ID, serviceId: SVC_A, startsAt: localDateTimeToUtc("2035-06-21", 10 * 60, SP) }); // amanha -> fora

    const rows = await listTodayScheduleForOwner({ businessId: BIZ_A, timeZone: SP, now });

    // ordenado por startsAt: 10:00 (hoje) antes de 23:30 (hoje, tarde da noite).
    expect(rows.map((r) => r.id)).toEqual([today, todayLateNight]);
  });
});
