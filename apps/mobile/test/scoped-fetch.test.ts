import { describe, expect, it, vi } from "vitest";
import { scopedFetchFor } from "../src/auth/scoped-fetch";
type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function scope() {
  let epoch = 1;
  const listeners = new Set<() => void>();
  return {
    getEpoch: () => epoch,
    assertEpoch: (expected: number) => {
      if (expected !== epoch) throw new Error("Session changed");
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    logout: () => {
      epoch++;
      listeners.forEach((fn) => fn());
    }
  };
}
describe("native requests stay inside their original account", () => {
  it("gives document upload/analysis enough time while retaining a bounded timeout", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | null | undefined;
      const network = vi.fn<FetchMock>().mockImplementation(async (_url, init) => {
        signal = init?.signal;
        return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("Timed out"))));
      });
      const pending = scopedFetchFor(scope(), 1, network)("https://api.example.test/v1/onboarding/document-analysis", { method: "POST" });
      const rejected = expect(pending).rejects.toThrow("Timed out");
      await vi.advanceTimersByTimeAsync(35_001);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(130_000);
      await rejected;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("never starts a request made by a stale client", async () => {
    const controller = scope();
    const network = vi.fn<FetchMock>();
    const fetch = scopedFetchFor(controller, 1, network);
    controller.logout();
    await expect(fetch("https://api.example.test/campaigns")).rejects.toThrow("Session changed");
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects an old workspace response even when logout happens after headers arrive", async () => {
    const controller = scope();
    let finish!: (value: string) => void;
    const body = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const response = new Response("ignored", { headers: { "Content-Type": "application/json" } });
    response.text = () => body;
    const network = vi.fn<FetchMock>().mockResolvedValue(response);
    const fetch = scopedFetchFor(controller, 1, network);
    const request = fetch("https://api.example.test/campaigns");
    const rejected = expect(request).rejects.toThrow("Session changed");
    await Promise.resolve();
    controller.logout();
    finish("{}");
    await rejected;
    expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it("uses bearer transport without browser cookies and preserves the response", async () => {
    const network = vi.fn<FetchMock>().mockResolvedValue(new Response('{"data":{"id":"campaign"}}', { headers: { "Content-Type": "application/json" } }));
    const response = await scopedFetchFor(
      scope(),
      1,
      network
    )("https://api.example.test/campaigns", { headers: { Authorization: "Bearer fixture" }, credentials: "include" });
    expect(network.mock.calls[0]?.[1]?.credentials).toBe("omit");
    expect(await response.json()).toEqual({ data: { id: "campaign" } });
  });
  it("preserves bilingual JSON without converting UTF-8 bytes into Latin text", async () => {
    const payload = { data: { title: "Blooms in Pink · أزهار وردية" } };
    const network = vi
      .fn<FetchMock>()
      .mockResolvedValue(new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json; charset=utf-8" } }));
    const response = await scopedFetchFor(scope(), 1, network)("https://api.example.test/campaigns");
    expect(await response.json()).toEqual(payload);
  });
});
