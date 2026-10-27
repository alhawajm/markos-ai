const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const identifier = (value: unknown) => (typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value) ? value : undefined);

/** Error monitoring must never become a second store for prompts, OAuth codes or personal data. */
export function sanitizeTelemetryEvent<T>(event: T): T {
  if (!record(event)) return event;
  const safe: Record<string, unknown> = {};
  for (const key of ["event_id", "timestamp", "platform", "level", "release", "environment", "type"]) {
    if (typeof event[key] === "string" || typeof event[key] === "number") safe[key] = event[key];
  }
  if (record(event.tags)) {
    safe.tags = Object.fromEntries(
      ["service", "http.method", "error.code", "worker.task"].flatMap((key) => {
        const value = identifier(event.tags && record(event.tags) ? event.tags[key] : undefined);
        return value ? [[key, value]] : [];
      })
    );
  }
  if (record(event.request) && typeof event.request.method === "string") safe.request = { method: event.request.method };
  if (record(event.exception) && Array.isArray(event.exception.values)) {
    safe.exception = {
      values: event.exception.values.filter(record).map((value) => ({
        type: identifier(value.type) ?? "Error",
        value: "Application error; inspect the classified error code and stack location.",
        ...(record(value.stacktrace) && Array.isArray(value.stacktrace.frames)
          ? {
              stacktrace: {
                frames: value.stacktrace.frames.filter(record).map((frame) => ({
                  ...(typeof frame.filename === "string" ? { filename: frame.filename.split(/[?#]/, 1)[0] } : {}),
                  ...(identifier(frame.function) ? { function: identifier(frame.function) } : {}),
                  ...(Number.isSafeInteger(frame.lineno) ? { lineno: frame.lineno } : {}),
                  ...(Number.isSafeInteger(frame.colno) ? { colno: frame.colno } : {}),
                  ...(typeof frame.in_app === "boolean" ? { in_app: frame.in_app } : {})
                }))
              }
            }
          : {})
      }))
    };
  }
  if (typeof event.message === "string") safe.message = "Application diagnostic";
  // No request URLs/bodies/headers, users, breadcrumbs, locals, source context or arbitrary extras.
  return safe as T;
}
