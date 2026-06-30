import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import {
  createService,
  updateService,
  deactivateService,
} from "@/server/owner/services";
import { createBookingForUser } from "@/server/booking/create-booking";
import { localDateTimeToUtc } from "@/domain/time";

// Teste de integração (toca Postgres) — ciclo de vida do serviço (FR-005/FR-006/FR-007/FR-012).
const BARBERSHOP_ID = "barbershop-trimote";
const USER_ID = "u-svc-lifecycle";
const PREFIX = "ZZTEST-"; // prefixo p/ isolar e limpar os serviços de teste

// 2026-12-16 é quarta (com expediente); 11:00 SP cabe em 09:00–18:00 e é futuro.
const slot = localDateTimeToUtc("2026-12-16", 11 * 60, "America/Sao_Paulo");

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: "svc-lifecycle@example.com" },
  });
});

afterEach(async () => {
  await prisma.booking.deleteMany({ where: { userId: USER_ID } });
  await prisma.barbershopService.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId: USER_ID } });
  await prisma.barbershopService.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.delete({ where: { id: USER_ID } });
  await prisma.$disconnect();
});

describe("ciclo de vida do serviço", () => {
  it("desativar um serviço com agendamento ativo preserva o agendamento (FR-005/FR-006)", async () => {
    const created = await createService({
      barbershopId: BARBERSHOP_ID,
      name: `${PREFIX}Cut A`,
      price: "40.00",
      durationMinutes: 30,
    });
    if (!created.ok) throw new Error("setup: createService falhou");

    const booking = await createBookingForUser({
      userId: USER_ID,
      serviceId: created.serviceId,
      startsAt: slot,
    });
    if (!booking.ok) throw new Error("setup: createBookingForUser falhou");

    const result = await deactivateService({ serviceId: created.serviceId });
    expect(result).toEqual({ ok: true });

    const service = await prisma.barbershopService.findUnique({ where: { id: created.serviceId } });
    expect(service?.isActive).toBe(false);

    // O agendamento continua íntegro (nada de delete físico).
    const stillThere = await prisma.booking.findUnique({ where: { id: booking.bookingId } });
    expect(stillThere?.status).toBe("ACTIVE");
  });

  it("rejeita nome duplicado entre ativos e permite reusar nome de inativo (FR-012)", async () => {
    const first = await createService({
      barbershopId: BARBERSHOP_ID,
      name: `${PREFIX}Unique`,
      price: "30.00",
      durationMinutes: 30,
    });
    if (!first.ok) throw new Error("setup falhou");

    const dup = await createService({
      barbershopId: BARBERSHOP_ID,
      name: `${PREFIX}Unique`,
      price: "30.00",
      durationMinutes: 30,
    });
    expect(dup).toEqual({ ok: false, reason: "name_taken" });

    // Desativar o primeiro libera o nome para um novo serviço ativo.
    await deactivateService({ serviceId: first.serviceId });
    const reused = await createService({
      barbershopId: BARBERSHOP_ID,
      name: `${PREFIX}Unique`,
      price: "30.00",
      durationMinutes: 30,
    });
    expect(reused.ok).toBe(true);
  });

  it("editar a duração não altera o endsAt de agendamentos existentes (FR-007)", async () => {
    const created = await createService({
      barbershopId: BARBERSHOP_ID,
      name: `${PREFIX}Cut B`,
      price: "50.00",
      durationMinutes: 30,
    });
    if (!created.ok) throw new Error("setup falhou");

    const booking = await createBookingForUser({
      userId: USER_ID,
      serviceId: created.serviceId,
      startsAt: slot,
    });
    if (!booking.ok) throw new Error("setup falhou");
    const before = await prisma.booking.findUnique({ where: { id: booking.bookingId } });

    const result = await updateService({ serviceId: created.serviceId, durationMinutes: 60 });
    expect(result).toEqual({ ok: true });

    const after = await prisma.booking.findUnique({ where: { id: booking.bookingId } });
    expect(after?.endsAt.toISOString()).toBe(before?.endsAt.toISOString());
  });
});
