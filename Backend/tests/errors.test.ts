import { describe, expect, it } from "vitest";

import { CoreError, isCoreError, ERROR_HTTP_STATUS } from "@/shared/errors/index";

describe("Phase 1 — error taxonomy", () => {
  it("maps code to default HTTP status and retryability", () => {
    const err = CoreError.of("POLICY_VIOLATION", "Recipient is blocked.");
    expect(err.httpStatus).toBe(ERROR_HTTP_STATUS.POLICY_VIOLATION);
    expect(err.retryable).toBe(false);
    expect(isCoreError(err)).toBe(true);
  });

  it("EXECUTION_UNKNOWN is explicitly not retryable (must reconcile)", () => {
    expect(CoreError.of("EXECUTION_UNKNOWN", "unknown").retryable).toBe(false);
  });

  it("serializes to a redacted payload without stack or secrets", () => {
    const err = CoreError.of("PROVIDER_ERROR", "upstream failed", {
      details: { provider: "ai", api_key: "sk_secret" },
    });
    const payload = err.toPayload();
    expect(payload.code).toBe("PROVIDER_ERROR");
    expect(payload.details.provider).toBe("ai");
    expect(payload.details.api_key).toBe("***REDACTED***");
    expect(JSON.stringify(payload)).not.toContain("sk_secret");
    expect(JSON.stringify(payload)).not.toContain("stack");
  });
});
