import { describe, expect, it, vi } from "vitest";
import { createFailureReporter } from "../src/observability/failure-alerts";

describe("operational alert delivery", () => {
  const failure = { service: "worker" as const, task: "publishing", code: "PROVIDER_TIMEOUT" };
  it("coalesces concurrent incidents and only sends classified diagnostic fields", async () => {
    const send = vi.fn(async () => new Response(null, { status: 202 }));
    const claim = vi.fn(async () => true);
    let clock = 100000;
    const report = createFailureReporter({
      apiKey: "TEST_KEY",
      from: "sender@example.test",
      to: "ops@example.test",
      cooldownSeconds: 900,
      claim,
      fetchImpl: send,
      now: () => clock
    });
    expect(await Promise.all([report(failure), report(failure)])).toEqual(["ACCEPTED", "SUPPRESSED"]);
    expect(send).toHaveBeenCalledTimes(1);
    clock += 900001;
    expect(await report(failure)).toBe("ACCEPTED");
    expect(await report({ ...failure, code: "credential=secret" })).toBe("SUPPRESSED");
    expect(claim).toHaveBeenCalledTimes(2);
  });
  it("keeps an outage alert bounded even when Redis is unavailable and preserves ambiguous delivery", async () => {
    const send = vi.fn(async () => {
      throw new Error("PRIVATE_RESPONSE");
    });
    const report = createFailureReporter({
      apiKey: "TEST",
      from: "sender@example.test",
      to: "ops@example.test",
      cooldownSeconds: 60,
      claim: async () => {
        throw new Error("Redis down");
      },
      fetchImpl: send
    });
    expect(await report(failure)).toBe("UNKNOWN");
    expect(await report(failure)).toBe("SUPPRESSED");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
