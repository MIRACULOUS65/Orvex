import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "@/api/app";
import { loadConfig } from "@/config/env";
import { setConfigForTests } from "@/config/index";

describe("Phase 1 — API foundation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    setConfigForTests(loadConfig({ CORE_ENV: "local", PORT: "8090" } as NodeJS.ProcessEnv));
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    setConfigForTests(null);
  });

  it("app starts and /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("sentinel-core");
  });

  it("/ready reports dependency status and is ready in local mode", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.dependencies).toHaveProperty("postgres");
    expect(body.dependencies).toHaveProperty("redis");
    expect(body.dependencies).toHaveProperty("configuration");
  });

  it("/version returns service metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/version" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.service).toBe("sentinel-core");
    expect(body.api_version).toBe("v1");
    expect(body.environment).toBe("local");
    expect(body.network).toBe("base-sepolia");
  });

  it("generates and echoes correlation + request IDs when absent", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-correlation-id"]).toMatch(/^corr_/);
    expect(res.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("propagates an inbound correlation ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-correlation-id": "corr_inbound_123" },
    });
    expect(res.headers["x-correlation-id"]).toBe("corr_inbound_123");
  });

  it("unknown route returns a structured NOT_FOUND envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.meta).toHaveProperty("request_id");
    expect(body.meta).toHaveProperty("correlation_id");
  });
});

describe("Phase 1 — readiness fails closed in strict mode without datastores", () => {
  it("/ready is not_ready in testnet mode when datastores are unconfigured at runtime", async () => {
    // Construct an app whose config claims datastores (so it loads), then a
    // readiness probe reports them unavailable — proving the report reflects real state.
    setConfigForTests(
      loadConfig({
        CORE_ENV: "testnet",
        DATABASE_URL: "postgresql://u:p@h:5432/db",
        REDIS_URL: "redis://h:6379",
      } as NodeJS.ProcessEnv),
    );
    const app = await buildApp({
      system: { probes: { postgres: async () => false, redis: async () => true } },
    });
    await app.ready();
    try {
      const res = await app.inject({ method: "GET", url: "/ready" });
      expect(res.statusCode).toBe(503);
      expect(res.json().status).toBe("not_ready");
      expect(res.json().dependencies.postgres.status).toBe("unavailable");
    } finally {
      await app.close();
      setConfigForTests(null);
    }
  });
});
