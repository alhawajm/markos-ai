import { describe, expect, it } from "vitest";
import { sanitizeTelemetryEvent } from "@markos/shared-types";

describe("error telemetry privacy", () => {
  it("retains stack locations and classified codes while discarding credentials, PII and document content", () => {
    const event = {
      event_id: "event-1",
      level: "error",
      release: "release-1",
      request: { url: "https://example.test/callback?code=SECRET", method: "GET", headers: { authorization: "SECRET" }, data: "BUSINESS DOCUMENT" },
      user: { email: "PRIVATE_EMAIL" },
      extra: { prompt: "BUSINESS DOCUMENT" },
      breadcrumbs: [{ message: "SECRET" }],
      message: "PRIVATE_EMAIL",
      tags: { service: "api", "error.code": "PROVIDER_TIMEOUT", private: "PRIVATE_EMAIL" },
      exception: {
        values: [
          {
            type: "ProviderError",
            value: "SECRET",
            stacktrace: {
              frames: [
                {
                  filename: "https://example.test/app.js?token=SECRET",
                  function: "run",
                  lineno: 12,
                  vars: { prompt: "BUSINESS DOCUMENT" },
                  context_line: "SECRET"
                }
              ]
            }
          }
        ]
      }
    };
    const clean = sanitizeTelemetryEvent(event),
      text = JSON.stringify(clean);
    for (const secret of ["SECRET", "PRIVATE_EMAIL", "BUSINESS DOCUMENT"]) expect(text).not.toContain(secret);
    expect(clean.tags).toEqual({ service: "api", "error.code": "PROVIDER_TIMEOUT" });
    expect(clean.exception.values[0]?.stacktrace.frames[0]).toEqual({ filename: "https://example.test/app.js", function: "run", lineno: 12 });
    expect(event.request.data).toBe("BUSINESS DOCUMENT");
    expect(sanitizeTelemetryEvent(clean)).toEqual(clean);
  });
  it("handles malformed monitoring payloads without breaking application error handling", () => {
    expect(sanitizeTelemetryEvent(null)).toBeNull();
    expect(sanitizeTelemetryEvent({ exception: { values: [null, "private", { type: "SECRET EMAIL@EXAMPLE", value: "private" }] } })).toEqual({
      exception: { values: [{ type: "Error", value: "Application error; inspect the classified error code and stack location." }] }
    });
  });
});
