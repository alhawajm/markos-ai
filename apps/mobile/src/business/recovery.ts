import type { OnboardingDocumentAnalysisRecord } from "@markos/shared-types";
/** After a lost upload response, look up the accepted analysis; never replay paid work here. */
export async function recoverDocumentAnalysis(
  request: () => Promise<OnboardingDocumentAnalysisRecord>,
  read: () => Promise<OnboardingDocumentAnalysisRecord | null>,
  expectedId?: string
): Promise<OnboardingDocumentAnalysisRecord> {
  try {
    return await request();
  } catch (error) {
    const recovered = await read();
    if (recovered && (!expectedId || recovered.id === expectedId)) return recovered;
    throw error;
  }
}
