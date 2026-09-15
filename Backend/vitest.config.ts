import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    clearMocks: true,
    setupFiles: ["tests/setup.env.ts"],
    // DB-backed suites open real Postgres connections; keep worker fan-out modest and
    // give slow remote/embedded startup room to breathe.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
