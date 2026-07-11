import { describe, it, expect, beforeAll } from "vitest";
import type { NextAuthOptions } from "next-auth";

// Guard same-origin explicito no callback de redirect do NextAuth (superficie de seguranca da feature
// de gate de login: o callbackUrl vem do cliente e nao pode virar open-redirect). Testamos o callback
// REALMENTE ligado em authOptions — nao um helper solto — para provar que a protecao esta wired.
//
// authOptions chama requiredEnv() no load (Google client id/secret); stubamos as envs e importamos
// dinamicamente para o modulo avaliar sem lancar.

const BASE_URL = "https://trimote.app";

let authOptions: NextAuthOptions;

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.NEXTAUTH_SECRET = "test-secret";
  ({ authOptions } = await import("@/server/auth/options"));
});

async function resolve(url: string, baseUrl: string = BASE_URL): Promise<string> {
  const redirect = authOptions.callbacks?.redirect;
  expect(redirect).toBeDefined();
  return redirect!({ url, baseUrl });
}

describe("guard same-origin no redirect do NextAuth", () => {
  it("aceita callbackUrl relativo (resolve contra o baseUrl do app)", async () => {
    const dest = await resolve("/b/acme?serviceId=svc_1&startsAt=2026-07-12T13:00:00.000Z");
    expect(dest).toBe(`${BASE_URL}/b/acme?serviceId=svc_1&startsAt=2026-07-12T13:00:00.000Z`);
  });

  it("aceita callbackUrl absoluto de MESMA origem", async () => {
    const dest = await resolve(`${BASE_URL}/my-bookings`);
    expect(dest).toBe(`${BASE_URL}/my-bookings`);
  });

  it("recusa callbackUrl de OUTRA origem (cai no baseUrl)", async () => {
    const dest = await resolve("https://evil.example/phish");
    expect(dest).toBe(BASE_URL);
  });

  it("recusa URL protocol-relative (//host — nao e mesma origem)", async () => {
    const dest = await resolve("//evil.example/phish");
    expect(dest).toBe(BASE_URL);
  });

  it("recusa URL malformada (cai no baseUrl)", async () => {
    const dest = await resolve("http://[::::]/");
    expect(dest).toBe(BASE_URL);
  });
});
