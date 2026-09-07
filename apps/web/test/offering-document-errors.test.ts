import { describe, expect, it } from "vitest";
import { canRetryOfferingDocumentFailure, offeringDocumentFailureMessage } from "../app/[locale]/_components/offering-document-errors";

describe("offering document failure guidance", () => {
  it("explains that provider configuration is required without offering a useless retry", () => {
    expect(offeringDocumentFailureMessage("en", "AI_PROVIDER_NOT_CONFIGURED")).toContain("not connected");
    expect(offeringDocumentFailureMessage("ar", "AI_PROVIDER_NOT_CONFIGURED")).toContain("غير متصل");
    expect(canRetryOfferingDocumentFailure("AI_PROVIDER_NOT_CONFIGURED")).toBe(false);
  });

  it("keeps retry available for temporary provider failures", () => {
    expect(offeringDocumentFailureMessage("en", "AI_PROVIDER_TIMEOUT")).toContain("remain available temporarily");
    expect(offeringDocumentFailureMessage("ar", "AI_PROVIDER_TIMEOUT")).toContain("متاحة مؤقتاً");
    expect(canRetryOfferingDocumentFailure("AI_PROVIDER_TIMEOUT")).toBe(true);
  });

  it("gives file-specific recovery for unreadable input", () => {
    expect(offeringDocumentFailureMessage("en", "AI_DOCUMENT_UNREADABLE")).toContain("text-based PDF");
    expect(offeringDocumentFailureMessage("ar", "AI_DOCUMENT_UNREADABLE")).toContain("PDF نصياً");
    expect(canRetryOfferingDocumentFailure("AI_DOCUMENT_UNREADABLE")).toBe(false);
  });
});
