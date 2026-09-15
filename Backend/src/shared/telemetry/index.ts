/**
 * OpenTelemetry scaffolding — Phase 1, Task 1.9.
 *
 * Instruments the boundaries named in BACKEND_ARCHITECTURE.md §55 (HTTP,
 * orchestration, policy evaluation, decision, approval, execution gate, clients,
 * DB where appropriate). This module provides a zero-cost no-op when telemetry is
 * disabled (the default and the test/local behavior), so tests never break and no
 * exporter is required. Span attributes are redacted before being set.
 *
 * The concrete exporter/provider wiring is intentionally minimal in Phase 1; deeper
 * instrumentation is layered into each component as it is built in later phases.
 */
import { redactValue } from "../logging/redaction.js";

export type SpanAttributes = Record<string, string | number | boolean>;

export interface TelemetryOptions {
  enabled: boolean;
  serviceName?: string;
  exporterEndpoint?: string;
}

let enabled = false;
let tracer: unknown = null;

/** Redact attribute values that look like secrets before they enter a span. */
export function safeAttributes(attrs: SpanAttributes): SpanAttributes {
  const cleaned = redactValue(attrs) as Record<string, unknown>;
  const out: SpanAttributes = {};
  for (const [k, v] of Object.entries(cleaned)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Initialize tracing if enabled. Never throws — a telemetry failure must not stop
 * the Core from starting or serving requests.
 */
export async function configureTelemetry(options: TelemetryOptions): Promise<void> {
  if (!options.enabled) {
    enabled = false;
    tracer = null;
    return;
  }
  try {
    const { trace } = await import("@opentelemetry/api");
    tracer = trace.getTracer(options.serviceName ?? "sentinel-core");
    enabled = true;
  } catch {
    // Telemetry is best-effort; degrade to no-op rather than failing the service.
    enabled = false;
    tracer = null;
  }
}

export function isTelemetryEnabled(): boolean {
  return enabled;
}

/**
 * Run `fn` inside a span named `name`. When telemetry is disabled this is a direct
 * pass-through with no overhead. Attributes are redacted.
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!enabled || tracer === null) {
    return await fn();
  }
  const attrs = safeAttributes(attributes);
  // Narrow the dynamically-imported tracer without a hard type dependency.
  const t = tracer as {
    startActiveSpan: (
      spanName: string,
      cb: (span: {
        setAttribute: (k: string, v: unknown) => void;
        recordException: (e: unknown) => void;
        setStatus: (s: { code: number }) => void;
        end: () => void;
      }) => Promise<T> | T,
    ) => Promise<T> | T;
  };
  return await t.startActiveSpan(name, async (span) => {
    try {
      for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
      const result = await fn();
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2 }); // ERROR
      throw err;
    } finally {
      span.end();
    }
  });
}
