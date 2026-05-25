export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logInfo(message: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level: "info", message, ...compact(fields) }));
}

export function logWarn(message: string, fields: LogFields = {}): void {
  console.warn(JSON.stringify({ level: "warn", message, ...compact(fields) }));
}

export function logError(message: string, error: unknown, fields: LogFields = {}): void {
  console.error(JSON.stringify({
    level: "error",
    message,
    error: error instanceof Error ? error.message : String(error),
    ...compact(fields)
  }));
}

function compact(fields: LogFields): LogFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
