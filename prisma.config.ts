// IMPORTANTE: o prisma.config.ts NÃO carrega o .env automaticamente (ao contrário do
// comportamento legado do CLI). Sem esta primeira linha, env("DATABASE_URL") vem vazio e
// `prisma migrate`/`prisma db seed` quebram. Por isso o dotenv é dependência direta.
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

// Migrations exigem a conexão DIRETA do Neon (host sem -pooler): o schema engine usa
// advisory lock, incompatível com PgBouncer em transaction mode. Guard fail-closed:
// em produção na Vercel, DIRECT_URL ausente derruba o build com causa nomeada, em vez
// do P1002/timeout genérico que o migrate deploy daria sobre a pooled.
const directUrl = process.env.DIRECT_URL;

if (process.env.VERCEL_ENV === "production" && !directUrl) {
  throw new Error(
    "DIRECT_URL ausente no ambiente de producao. O migrate deploy do build exige " +
      "a conexao direta do Neon (host sem -pooler); a pooled quebra o advisory lock.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // `datasource` (override da url do schema) exige o schema engine clássico nos tipos do
  // @prisma/config 6.x. Lê DATABASE_URL do process.env (já populado pelo dotenv acima).
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
    // directUrl só quando definida: sem ela (ex.: preview na Vercel), migrate usa `url`
    // — comportamento idêntico ao anterior. Este override é o valor EFETIVO; o
    // directUrl do schema.prisma é ignorado enquanto este bloco existir.
    ...(directUrl ? { directUrl } : {}),
  },
});
