import { describe, expect, it, vi } from "vitest";
import { MarkosApiClient, MarkosApiError } from "@markos/api-client";
import { errorMessage } from "../src/errors";
import { scopedFetchFor } from "../src/auth/scoped-fetch";

const english = (en: string) => en;
describe("native request failure messages", () => {
  it("preserves the missing-media approval error through the native transport", async () => {
    const network = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "CONTENT_MEDIA_REQUIRED", message: "Attach compatible media" } }), {
          status: 409,
          headers: { "content-type": "application/json; charset=utf-8" }
        })
      );
    const api = new MarkosApiClient({
      baseUrl: "https://example.test",
      fetch: scopedFetchFor({ assertEpoch: () => {}, getEpoch: () => 1, subscribe: () => () => {} }, 1, network)
    });
    const error = await api.updateContentStatus("story", "APPROVED", 8).catch((problem: unknown) => problem);
    expect(errorMessage(error, english)).toBe("Attach media to every slot before marking ready.");
    expect(network).toHaveBeenCalledOnce();
  });
  it("does not describe server validation/conflict failures as connectivity problems", () => {
    for (const code of [undefined, "CONTENT_MEDIA_INCOMPATIBLE", "CONTENT_CAPTION_TOO_LONG", "CONTENT_MEDIA_DUPLICATE", "CONTENT_MEDIA_UNAVAILABLE"]) {
      expect(errorMessage(new MarkosApiError("rejected", 409, code), english)).not.toMatch(/connection|reach MARKOS/);
    }
    expect(errorMessage(new MarkosApiError("rejected", 409), english)).toContain("saved draft");
    expect(errorMessage(new MarkosApiError("unavailable", 503), english)).toContain("MARKOS could not finish");
  });
  it("retains readable validation errors if an Error loses its class prototype", () => {
    const error = Object.assign(new Error("missing media"), { name: "MarkosApiError", status: 409, code: "CONTENT_MEDIA_REQUIRED" });
    expect(errorMessage(error, english)).toContain("Attach media");
  });
  it("distinguishes a network failure from a bounded timeout in both languages", () => {
    expect(errorMessage(new TypeError("Network request failed"), english)).toContain("Check your connection");
    expect(errorMessage(new MarkosApiError("Request timed out", 0, "REQUEST_TIMEOUT"), english)).toContain("saved state");
    expect(errorMessage(new MarkosApiError("Request timed out", 0, "REQUEST_TIMEOUT"), (_en, ar) => ar)).toContain("مهلة");
  });
});
