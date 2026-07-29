import { describe, expect, it, vi } from "vitest";
import {
  reportUnexpectedRequestError,
  safeRequestPath,
} from "../src/http/error-telemetry";

describe("error telemetry URL redaction", () => {
  it("retains only the path for unexpected OAuth callback failures", () => {
    const logger = { error: vi.fn() };
    const capture = vi.fn();
    const url =
      "/v1/workspace/instagram/oauth/callback?code=recognizable-code&state=recognizable-state&error_description=recognizable-provider-error&access_token=recognizable-token&client_secret=recognizable-secret";

    reportUnexpectedRequestError({
      error: new Error("unexpected persistence failure"),
      logger,
      method: "GET",
      url,
      capture,
    });

    expect(safeRequestPath(url)).toBe(
      "/v1/workspace/instagram/oauth/callback",
    );
    const logged = JSON.stringify(logger.error.mock.calls);
    const captured = JSON.stringify(capture.mock.calls);
    for (const value of [
      "recognizable-code",
      "recognizable-state",
      "recognizable-provider-error",
      "recognizable-token",
      "recognizable-secret",
    ]) {
      expect(logged).not.toContain(value);
      expect(captured).not.toContain(value);
    }
    expect(capture).toHaveBeenCalledWith(expect.any(Error), {
      method: "GET",
      url: "/v1/workspace/instagram/oauth/callback",
    });
  });
});
