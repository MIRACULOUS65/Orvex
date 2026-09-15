import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Anvil / Sepolia suites are opt-in via env; they self-skip when the required
    // tooling/credentials are absent so the default run is fully deterministic + offline.
    testTimeout: 30_000,
  },
});
