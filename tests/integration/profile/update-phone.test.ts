import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

import { prisma } from "@/server/db/client";
import { updatePhoneForUser } from "@/server/profile/update-phone";

/**
 * Integração (Postgres) da atualização de telefone do titular (issue #34). Prova que o core persiste
 * a forma canônica E.164 (não o que foi digitado), que limpa com vazio/null, e que recusa inválido
 * sem escrever. A normalização em si já é coberta em tests/unit/phone; aqui é o write-path.
 */

const USER_ID = "u-phone-it";

async function storedPhone(): Promise<string | null> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID }, select: { phone: true } });
  return u.phone;
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { phone: null, email: "phone-it@example.com" },
    create: { id: USER_ID, email: "phone-it@example.com" },
  });
});

afterEach(async () => {
  await prisma.user.update({ where: { id: USER_ID }, data: { phone: null } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.$disconnect();
});

describe("updatePhoneForUser (issue #34)", () => {
  it("persiste a forma canônica E.164, não o que foi digitado", async () => {
    const r = await updatePhoneForUser({ userId: USER_ID, phone: "(11) 99999-9999" });
    expect(r).toEqual({ ok: true, phone: "+5511999999999" });
    expect(await storedPhone()).toBe("+5511999999999");
  });

  it("limpa o telefone com string vazia e com null", async () => {
    await updatePhoneForUser({ userId: USER_ID, phone: "(11) 99999-9999" });

    const vazio = await updatePhoneForUser({ userId: USER_ID, phone: "   " });
    expect(vazio).toEqual({ ok: true, phone: null });
    expect(await storedPhone()).toBeNull();

    await updatePhoneForUser({ userId: USER_ID, phone: "(11) 99999-9999" });
    const nulo = await updatePhoneForUser({ userId: USER_ID, phone: null });
    expect(nulo).toEqual({ ok: true, phone: null });
    expect(await storedPhone()).toBeNull();
  });

  it("recusa inválido (invalid_phone) sem escrever", async () => {
    await updatePhoneForUser({ userId: USER_ID, phone: "+5511999999999" });

    const r = await updatePhoneForUser({ userId: USER_ID, phone: "(10) 3333-4444" });
    expect(r).toEqual({ ok: false, reason: "invalid_phone" });
    // O telefone anterior permanece — a recusa não toca o banco.
    expect(await storedPhone()).toBe("+5511999999999");
  });
});
