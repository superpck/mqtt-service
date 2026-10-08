import dayjs from "dayjs";

type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const timestamp = dayjs().format("YYYY-MM-DD HH:mm:ss.SSS");
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  if (level === "error") {
    console.error(line + suffix);
  } else if (level === "warn") {
    console.warn(line + suffix);
  } else {
    console.log(line + suffix);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
};
