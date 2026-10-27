import { MarkosApiError } from "@markos/api-client";
import type { OnboardingDocumentAnalysisRecord } from "@markos/shared-types";

type ReadAnalysis = () => Promise<OnboardingDocumentAnalysisRecord | null>;

export async function recoverOnboardingDocumentRequest(
  request: () => Promise<OnboardingDocumentAnalysisRecord>,
  read: ReadAnalysis,
  analysisId?: string
): Promise<OnboardingDocumentAnalysisRecord> {
  try {
    return await request();
  } catch (error) {
    // A lost response can leave a completed or still-running analysis on the server.
    if (!(error instanceof TypeError) && !(error instanceof MarkosApiError && error.code === "ONBOARDING_DOCUMENT_ANALYSIS_CONFLICT")) {
      throw error;
    }
    const analysis = await read();
    if (analysis && (analysisId === undefined || analysis.id === analysisId)) return analysis;
    throw error;
  }
}

export function pollOnboardingDocumentAnalysis({
  analysisId,
  read,
  onAnalysis,
  onError
}: {
  analysisId: string;
  read: ReadAnalysis;
  onAnalysis: (analysis: OnboardingDocumentAnalysisRecord | null) => void;
  onError: (error: unknown) => void;
}): () => void {
  let cancelled = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function poll() {
    try {
      const analysis = await read();
      if (cancelled || (analysis && analysis.id !== analysisId)) return;
      failures = 0;
      onAnalysis(analysis);
      if (analysis?.status !== "PROCESSING") return;
    } catch (error) {
      if (cancelled) return;
      failures += 1;
      const transient = error instanceof TypeError || (error instanceof MarkosApiError && error.status >= 500);
      if (!transient || failures >= 3) {
        onError(error);
        return;
      }
    }
    if (!cancelled) timer = setTimeout(() => void poll(), 2000);
  }

  void poll();
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
