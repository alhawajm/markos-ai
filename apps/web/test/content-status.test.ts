import { describe, expect, it } from "vitest";
import { contentStatuses, locales } from "@markos/shared-types";
import { contentStatusLabel, contentStatusPresentation } from "../app/[locale]/_components/content-status";

describe("content status presentation", () => {
  it("covers every persisted content state in both interface languages", () => {
    expect(Object.keys(contentStatusPresentation).sort()).toEqual([...contentStatuses].sort());
    for (const locale of locales) {
      const labels = contentStatuses.map((status) => contentStatusLabel(status, locale));
      expect(labels.every((label) => label.trim().length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(contentStatuses.length);
    }
  });

  it("keeps review, readiness and publishing failure distinct", () => {
    expect(contentStatusLabel("IN_REVIEW", "en")).toBe("In review");
    expect(contentStatusLabel("IN_REVIEW", "ar")).toBe("قيد المراجعة");
    expect(contentStatusLabel("APPROVED", "en")).toBe("Ready");
    expect(contentStatusLabel("APPROVED", "ar")).toBe("جاهز");
    expect(contentStatusLabel("FAILED", "en")).toBe("Failed");
    expect(contentStatusLabel("FAILED", "ar")).toBe("تعذّر النشر");
    expect(new Set([contentStatusPresentation.IN_REVIEW.tone, contentStatusPresentation.APPROVED.tone, contentStatusPresentation.FAILED.tone]).size).toBe(3);
  });
});
