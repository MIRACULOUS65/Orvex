/**
 * Structured JSON logger — Phase 1, Task 1.4.
 *
 * Emits one JSON object per log line with the required fields (timestamp, level,
 * service, event, correlation_id, trace_id, ...). Every payload passes through the
 * redaction layer before serialization, so secrets can never reach stdout.
 *
 * A logger can be bound with correlation context so downstream code inherits it.
 */
import { redactValue } from "./redaction.js";
import { type LogLevel, LOG_LEVEL_ORDER } from "./levels.js";

export interface LogContext {
  correlation_id?: string;
  request_id?: string;
  trace_id?: string;
  company_id?: string;
  agent_id?: string;
  intent_id?: string;
  proposal_id?: string;
  decision_id?: string;
  transaction_id?: string;
  execution_id?: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  service?: string;
  level?: LogLevel;
  /** Sink for rendered JSON lines. Defaults to process.stdout. Injectable for tests. */
  sink?: (line: string) => void;
}

export class Logger {
  private readonly service: string;
  private readonly level: LogLevel;
  private readonly bound: LogContext;
  private readonly sink: (line: string) => void;

  constructor(options: LoggerOptions = {}, bound: LogContext = {}) {
    this.service = options.service ?? "sentinel-core";
    this.level = options.level ?? "info";
    this.sink = options.sink ?? ((line) => process.stdout.write(line + "\n"));
    this.bound = bound;
  }

  /** Return a new logger that always includes the given context fields. */
  child(context: LogContext): Logger {
    return new Logger(
      { service: this.service, level: this.level, sink: this.sink },
      { ...this.bound, ...context },
    );
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      event,
      ...this.bound,
      ...(data ?? {}),
    };
    const safe = redactValue(record) as Record<string, unknown>;
    this.sink(JSON.stringify(safe));
  }

  debug(event: string, data?: Record<string, unknown>): void {
    this.write("debug", event, data);
  }
  info(event: string, data?: Record<string, unknown>): void {
    this.write("info", event, data);
  }
  warn(event: string, data?: Record<string, unknown>): void {
    this.write("warn", event, data);
  }
  error(event: string, data?: Record<string, unknown>): void {
    this.write("error", event, data);
  }
}

let root: Logger | null = null;

export function getLogger(): Logger {
  if (root === null) root = new Logger();
  return root;
}

export function configureLogger(options: LoggerOptions): Logger {
  root = new Logger(options);
  return root;
}
