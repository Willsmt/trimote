import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Dois modos de teste (Princípio IV):
// - unit: lógica de domínio pura (tests/unit), roda SEM banco.
// - integration: exclusion constraint sob concorrência (tests/integration), roda contra Postgres.
// A seleção é feita pelo caminho passado nos scripts test:unit / test:integration.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
