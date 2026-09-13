import { describe, expect, it, vi } from "vitest";
import { observeWorkerTask, settleWorkerBatch, workerErrorCode } from "../src/worker/worker-diagnostics";

describe("worker diagnostics", () => {
  it("waits for already-started siblings before reporting a batch failure", async () => {
    let finish!: (value: number) => void;
    const sibling = new Promise<number>((resolve) => {
      finish = resolve;
    });
    const failure = new Error("batch failure");
    const caught = vi.fn();
    const result = settleWorkerBatch([Promise.reject(failure), sibling]).catch(caught);
    await Promise.resolve();
    await Promise.resolve();
    expect(caught).not.toHaveBeenCalled();
    finish(1);
    await result;
    expect(caught).toHaveBeenCalledWith(failure);
  });
  it("identifies the failing task without logging provider bodies or credentials", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const error = Object.assign(new Error("secret provider response"), { code: "INSTAGRAM_PROVIDER_TIMEOUT" });
    await expect(
      observeWorkerTask(logger, "publishing", async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith("Worker task failed", {
      task: "publishing",
      durationMs: expect.any(Number),
      errorCode: "INSTAGRAM_PROVIDER_TIMEOUT"
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret");
    expect(workerErrorCode(new Error("private"))).toBe("WORKER_UNEXPECTED_ERROR");
    expect(workerErrorCode({ code: "https://private/token" })).toBe("WORKER_UNEXPECTED_ERROR");
  });
});
