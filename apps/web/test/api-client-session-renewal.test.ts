import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkosApiClient, MarkosApiError } from "@markos/api-client";

describe("MARKOS API client session renewal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renews only an expired access token and retries the request once", async () => {
    const requests: RequestInit[] = [];
    const responses = [
      errorResponse(401, "INVALID_TOKEN", "Bearer token is invalid or expired"),
      jsonResponse({
        connected: false,
        status: "DISCONNECTED",
        recentMedia: []
      })
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requests.push(init ?? {});
        return responses.shift()!;
      })
    );
    const renewAccessToken = vi.fn(async () => "renewed-access-token");
    const onSessionExpired = vi.fn();
    const client = new MarkosApiClient({
      accessToken: "expired-access-token",
      baseUrl: "https://api.markos.test",
      onSessionExpired,
      renewAccessToken,
      workspaceId: "workspace-1"
    });

    await expect(client.instagramConnection()).resolves.toMatchObject({
      connected: false
    });

    expect(renewAccessToken).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect((requests[0]?.headers as Record<string, string>).Authorization).toBe("Bearer expired-access-token");
    expect((requests[1]?.headers as Record<string, string>).Authorization).toBe("Bearer renewed-access-token");
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
  });

  it("does not renew unrelated authentication or authorization failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse(403, "EMAIL_VERIFICATION_REQUIRED", "Email verification is required before this action"))
    );
    const renewAccessToken = vi.fn(async () => "unused");
    const client = new MarkosApiClient({
      accessToken: "valid-access-token",
      baseUrl: "https://api.markos.test",
      renewAccessToken
    });

    await expect(client.generateStrategy({})).rejects.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
      status: 403
    });
    expect(renewAccessToken).not.toHaveBeenCalled();
  });

  it("ends the browser session only for a terminal refresh failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse(401, "INVALID_TOKEN", "Bearer token is invalid or expired"))
    );
    const onSessionExpired = vi.fn();
    const client = new MarkosApiClient({
      accessToken: "expired-access-token",
      baseUrl: "https://api.markos.test",
      onSessionExpired,
      renewAccessToken: async () => {
        throw new MarkosApiError("Refresh token is invalid or expired", 401, "INVALID_REFRESH_TOKEN");
      }
    });

    await expect(client.instagramConnection()).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN"
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("uses the scoped offering-document analysis lifecycle routes", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ input: String(input), init: init ?? {} });
        return jsonResponse(null);
      })
    );
    const client = new MarkosApiClient({
      accessToken: "access-token",
      baseUrl: "https://api.markos.test",
      workspaceId: "workspace-1"
    });

    await client.offeringDocumentAnalysis();
    await client.analyzeOfferingDocuments([{ filename: "offers.txt", mimeType: "text/plain", base64Data: "dGVzdA==" }]);
    await client.retryOfferingDocumentAnalysis("analysis-1");
    await client.approveOfferingDocumentAnalysis("analysis-1", { summary: "Coffee services" });
    await client.discardOfferingDocumentAnalysis("analysis-1");

    expect(requests.map((request) => [request.init.method ?? "GET", request.input])).toEqual([
      ["GET", "https://api.markos.test/v1/onboarding/products/document-analysis"],
      ["POST", "https://api.markos.test/v1/onboarding/products/document-analysis"],
      ["POST", "https://api.markos.test/v1/onboarding/products/document-analysis/analysis-1/retry"],
      ["POST", "https://api.markos.test/v1/onboarding/products/document-analysis/analysis-1/approve"],
      ["DELETE", "https://api.markos.test/v1/onboarding/products/document-analysis/analysis-1"]
    ]);
    expect(JSON.parse(String(requests[1]?.init.body))).toEqual({
      files: [{ filename: "offers.txt", mimeType: "text/plain", base64Data: "dGVzdA==" }]
    });
    expect(JSON.parse(String(requests[3]?.init.body))).toEqual({ catalog: { summary: "Coffee services" } });
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    headers: { "content-type": "application/json" },
    status
  });
}
