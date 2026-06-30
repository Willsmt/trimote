// IMPORTANTE: o prisma.config.ts NÃO carrega o .env automaticamente (ao contrário do
// comportamento legado do CLI). Sem esta primeira linha, env("DATABASE_URL") vem vazio e
// `prisma migrate`/`prisma db seed` quebram. Por isso o dotenv é dependência direta.
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

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
  },
});
