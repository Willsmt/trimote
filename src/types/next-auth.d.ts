import type { DefaultSession } from "next-auth";

// Expõe o id do usuário na sessão (preenchido pelo callback em src/server/auth/options.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
