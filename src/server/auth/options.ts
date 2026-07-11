import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";

import { prisma } from "@/server/db/client";

// Segredos (client id/secret, NEXTAUTH_SECRET) vêm apenas de variáveis de ambiente (Princípio I).
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    // Com sessões em banco, expõe o user.id na sessão para identificar o owner dos agendamentos
    // (FR-001, FR-010..FR-012).
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    // Guard same-origin EXPLÍCITO (anti open-redirect). O gate de login da página pública monta o
    // callbackUrl a partir do clique do visitante; sem este guard, um callbackUrl forjado poderia
    // levar o usuário para outro host após o OAuth. Tornamos a proteção do NextAuth explícita e
    // própria — e mais estrita: `//host` (protocol-relative) NÃO é tratado como relativo.
    redirect({ url, baseUrl }) {
      // Relativo de verdade (uma única barra): mesma origem por construção.
      if (url.startsWith("/") && !url.startsWith("//")) {
        return `${baseUrl}${url}`;
      }
      // Absoluto: só passa se a origem for exatamente a do app; qualquer outra volta para a home.
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) {
          return url;
        }
      } catch {
        // URL malformada → não confiável.
      }
      return baseUrl;
    },
  },
};
