import { describe, expect, it, vi } from "vitest";
import { MarkosApiClient } from "@markos/api-client";

describe("campaign submission transport", () => {
  it("keeps the same idempotency key and bilingual brief across access-token renewal", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init!);
      return calls.length === 1
        ? Response.json({ error: { code: "INVALID_TOKEN", message: "Expired" } }, { status: 401 })
        : Response.json({ data: { id: "job", status: "QUEUED" } }, { status: 202 });
    });
    const client = new MarkosApiClient({
      baseUrl: "https://api.example.test",
      accessToken: "old",
      workspaceId: "workspace",
      fetch: fetchImpl,
      renewAccessToken: async () => "new"
    });
    const brief = { startsAt: "2026-10-04T00:00:00.000Z", description: "Blooms · معًا من أجل الوعي" };
    await client.queueCampaignGeneration("request-id", brief);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => new Headers(call.headers).get("Idempotency-Key"))).toEqual(["request-id", "request-id"]);
    expect(calls.map((call) => new Headers(call.headers).get("X-Workspace-Id"))).toEqual(["workspace", "workspace"]);
    expect(calls.map((call) => JSON.parse(String(call.body)))).toEqual([brief, brief]);
  });
  it("does not replay a campaign when the network loses its response", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit): Promise<Response> => {
      throw new TypeError("Network unavailable");
    });
    const client = new MarkosApiClient({ baseUrl: "https://api.example.test", fetch: fetchImpl });
    await expect(client.queueCampaignGeneration("request-id", { startsAt: "2026-10-04T00:00:00.000Z" })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
