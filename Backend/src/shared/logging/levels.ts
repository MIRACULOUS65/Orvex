/** Log levels and ordering. */
export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
