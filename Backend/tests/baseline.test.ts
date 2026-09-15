/**
 * Phase 0 baseline test (Task 0.4).
 *
 * Proves the three Phase-0 exit conditions for the test runner:
 *   1. the service package imports (via the `@` path alias),
 *   2. shared configuration loads,
 *   3. the test runner executes.
 */
import { describe, expect, it } from "vitest";

import { loadBaselineConfig } from "@/config/env";

describe("Phase 0 baseline", () => {
  it("test runner executes", () => {
    expect(true).toBe(true);
  });

  it("service package imports via the @ alias", () => {
    expect(typeof loadBaselineConfig).toBe("function");
  });

  it("shared configuration loads with safe defaults", () => {
    const config = loadBaselineConfig();
    expect(config.serviceName).toBe("sentinel-core");
    expect(config.version).toBe("0.1.0");
    expect(["local", "ci", "test", "testnet", "production"]).toContain(config.environment);
  });

  it("environment falls back to 'local' for unknown values", () => {
    const previous = process.env.CORE_ENV;
    process.env.CORE_ENV = "not-a-real-env";
    try {
      expect(loadBaselineConfig().environment).toBe("local");
    } finally {
      if (previous === undefined) delete process.env.CORE_ENV;
      else process.env.CORE_ENV = previous;
    }
  });
});
