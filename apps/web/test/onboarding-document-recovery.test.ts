import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkosApiError } from "@markos/api-client";
import type { OnboardingDocumentAnalysisRecord } from "@markos/shared-types";
import { pollOnboardingDocumentAnalysis, recoverOnboardingDocumentRequest } from "../app/[locale]/_components/onboarding-document-recovery";

function analysis(status: OnboardingDocumentAnalysisRecord["status"]): OnboardingDocumentAnalysisRecord {
  return {
    id: "analysis-1",
    workspaceId: "workspace-1",
    status,
    files: [],
    expiresAt: "2026-09-22T00:00:00Z",
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z"
  };
}

afterEach(() => vi.useRealTimers());

describe("onboarding document request recovery", () => {
  it.each(["PROCESSING", "READY", "FAILED"] as const)("restores persisted %s after a lost create or retry response", async (status) => {
    const persisted = analysis(status);
    const request = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const read = vi.fn().mockResolvedValue(persisted);
    await expect(recoverOnboardingDocumentRequest(request, read)).resolves.toEqual(persisted);
    await expect(recoverOnboardingDocumentRequest(request, read, persisted.id)).resolves.toEqual(persisted);
    expect(request).toHaveBeenCalledTimes(2); // Recovery never resubmits the paid analysis.
  });

  it("retains existing conflict recovery", async () => {
    const request = vi.fn().mockRejectedValue(new MarkosApiError("Active analysis", 409, "ONBOARDING_DOCUMENT_ANALYSIS_CONFLICT"));
    await expect(recoverOnboardingDocumentRequest(request, async () => analysis("PROCESSING"))).resolves.toEqual(analysis("PROCESSING"));
  });

  it.each([400, 401, 403])("surfaces HTTP %s without replacing it with persisted state", async (status) => {
    const error = new MarkosApiError("Request rejected", status);
    const read = vi.fn();
    await expect(recoverOnboardingDocumentRequest(vi.fn().mockRejectedValue(error), read)).rejects.toBe(error);
    expect(read).not.toHaveBeenCalled();
  });

  it("preserves errors when no matching analysis exists, and surfaces failed recovery reads", async () => {
    const networkError = new TypeError("Failed to fetch");
    const request = vi.fn().mockRejectedValue(networkError);
    await expect(recoverOnboardingDocumentRequest(request, async () => null)).rejects.toBe(networkError);
    await expect(recoverOnboardingDocumentRequest(request, async () => analysis("READY"), "different-id")).rejects.toBe(networkError);
    const authError = new MarkosApiError("Session expired", 401);
    const read = vi.fn().mockRejectedValue(authError);
    await expect(recoverOnboardingDocumentRequest(request, read)).rejects.toBe(authError);
    expect(read).toHaveBeenCalledOnce();
  });
});

describe("persisted onboarding analysis polling", () => {
  it.each(["READY", "FAILED"] as const)("follows PROCESSING to %s and stops", async (status) => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(analysis("PROCESSING")).mockResolvedValue(analysis(status));
    const onAnalysis = vi.fn();
    const onError = vi.fn();
    const stop = pollOnboardingDocumentAnalysis({ analysisId: "analysis-1", read, onAnalysis, onError });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onAnalysis.mock.calls.map(([value]) => value.status)).toEqual(["PROCESSING", status]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("recovers transient reads, but stops after three consecutive failures", async () => {
    vi.useFakeTimers();
    const error = new TypeError("Failed to fetch");
    const read = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(analysis("PROCESSING")).mockRejectedValue(error);
    const onError = vi.fn();
    const stop = pollOnboardingDocumentAnalysis({ analysisId: "analysis-1", read, onAnalysis: vi.fn(), onError });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledTimes(5);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("surfaces authentication failures immediately", async () => {
    vi.useFakeTimers();
    const error = new MarkosApiError("Session expired", 401);
    const read = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const stop = pollOnboardingDocumentAnalysis({ analysisId: "analysis-1", read, onAnalysis: vi.fn(), onError });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    stop();
  });

  it("cancels scheduled reads and ignores a response arriving after cleanup", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(analysis("PROCESSING"));
    const stop = pollOnboardingDocumentAnalysis({ analysisId: "analysis-1", read, onAnalysis: vi.fn(), onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledOnce();

    let resolve!: (value: OnboardingDocumentAnalysisRecord) => void;
    const pending = new Promise<OnboardingDocumentAnalysisRecord>((done) => { resolve = done; });
    const onAnalysis = vi.fn();
    const stopPending = pollOnboardingDocumentAnalysis({ analysisId: "analysis-1", read: () => pending, onAnalysis, onError: vi.fn() });
    stopPending();
    resolve(analysis("READY"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onAnalysis).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
