import { describe, expect, it } from "vitest";

import { Logger, redactString, redactValue, isSensitiveKey } from "@/shared/logging/index";

describe("Phase 1 — secret redaction", () => {
  it("flags sensitive keys", () => {
    expect(isSensitiveKey("apiKey")).toBe(true);
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("private_key")).toBe(true);
    expect(isSensitiveKey("recipient")).toBe(false);
  });

  it("redacts bearer tokens in strings", () => {
    expect(redactString("Authorization: Bearer abc.def.ghi")).not.toContain("abc.def.ghi");
  });

  it("redacts credentials embedded in a URL", () => {
    const out = redactString("postgresql://user:supersecret@host:5432/db");
    expect(out).not.toContain("supersecret");
  });

  it("deep-redacts object values by key", () => {
    const out = redactValue({
      recipient: "0xABC",
      api_key: "sk_live_123",
      nested: { token: "tok_456", amount: "4.20" },
    }) as Record<string, unknown>;
    expect(out.recipient).toBe("0xABC");
    expect(out.api_key).toBe("***REDACTED***");
    expect((out.nested as Record<string, unknown>).token).toBe("***REDACTED***");
    expect((out.nested as Record<string, unknown>).amount).toBe("4.20");
  });

  it("handles circular references without crashing", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => redactValue(a)).not.toThrow();
  });
});

describe("Phase 1 — structured logger", () => {
  it("emits JSON with required fields and never leaks secrets", () => {
    const lines: string[] = [];
    const logger = new Logger({ service: "sentinel-core", level: "debug", sink: (l) => lines.push(l) });
    logger.child({ correlation_id: "corr_1", request_id: "req_1" }).info("decision_created", {
      decision: "ALLOW",
      internal_service_token: "tok_secret_xyz",
    });
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record.level).toBe("info");
    expect(record.service).toBe("sentinel-core");
    expect(record.event).toBe("decision_created");
    expect(record.correlation_id).toBe("corr_1");
    expect(record.internal_service_token).toBe("***REDACTED***");
    expect(lines[0]).not.toContain("tok_secret_xyz");
  });

  it("respects level filtering", () => {
    const lines: string[] = [];
    const logger = new Logger({ level: "warn", sink: (l) => lines.push(l) });
    logger.info("ignored");
    logger.warn("kept");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).event).toBe("kept");
  });
});
