import { describe, expect, it } from "vitest";

import { loadConfig, ConfigurationError, loadBaselineConfig } from "@/config/env";
import { redactedConfig } from "@/config/index";

const base = {
  CORE_ENV: "local",
  PORT: "8090",
};

describe("Phase 1 — configuration validation", () => {
  it("loads valid local config with defaults", () => {
    const cfg = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(cfg.environment).toBe("local");
    expect(cfg.port).toBe(8090);
    expect(cfg.executionMode).toBe("SIMULATE");
    expect(cfg.allowMainnet).toBe(false);
    expect(cfg.network).toBe("base-sepolia");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ CORE_ENV: "local", PORT: "not-a-port" } as NodeJS.ProcessEnv)).toThrow(
      ConfigurationError,
    );
  });

  it("rejects an invalid execution mode", () => {
    expect(() =>
      loadConfig({ CORE_ENV: "local", EXECUTION_MODE: "YOLO" } as NodeJS.ProcessEnv),
    ).toThrow(ConfigurationError);
  });

  it("fails closed in production without DATABASE_URL/REDIS_URL", () => {
    expect(() =>
      loadConfig({ CORE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(ConfigurationError);
  });

  it("production requires INTERNAL_SERVICE_TOKEN", () => {
    try {
      loadConfig({
        CORE_ENV: "production",
        DATABASE_URL: "postgresql://u:p@h:5432/db",
        REDIS_URL: "redis://h:6379",
      } as NodeJS.ProcessEnv);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigurationError);
      expect((err as ConfigurationError).missing.join(",")).toContain("INTERNAL_SERVICE_TOKEN");
    }
  });

  it("testnet requires datastores but not the service token", () => {
    const cfg = loadConfig({
      CORE_ENV: "testnet",
      DATABASE_URL: "postgresql://u:p@h:5432/db",
      REDIS_URL: "redis://h:6379",
    } as NodeJS.ProcessEnv);
    expect(cfg.environment).toBe("testnet");
  });

  it("redactedConfig hides secret values but keeps presence", () => {
    const cfg = loadConfig({
      CORE_ENV: "testnet",
      DATABASE_URL: "postgresql://user:supersecret@host:5432/db",
      REDIS_URL: "redis://host:6379",
      INTERNAL_SERVICE_TOKEN: "tok_live_ABC123",
    } as NodeJS.ProcessEnv);
    const view = redactedConfig(cfg);
    expect(view.databaseUrl).toBe("***REDACTED***");
    expect(view.internalServiceToken).toBe("***REDACTED***");
    expect(view.environment).toBe("testnet"); // non-secret preserved
    expect(JSON.stringify(view)).not.toContain("supersecret");
    expect(JSON.stringify(view)).not.toContain("tok_live_ABC123");
  });

  it("preserves Phase 0 loadBaselineConfig behavior", () => {
    expect(loadBaselineConfig({ CORE_ENV: "unknown" } as NodeJS.ProcessEnv).environment).toBe("local");
    expect(loadBaselineConfig({ CORE_ENV: "testnet" } as NodeJS.ProcessEnv).environment).toBe("testnet");
  });
});
