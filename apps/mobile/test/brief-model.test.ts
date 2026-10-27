import { describe, expect, it } from "vitest";
import { bahrainDate, campaignStart, ownedReferenceUri, validDate, validateReferences } from "../src/campaigns/brief-model";
const file = { filename: "proposal.pdf", mimeType: "application/pdf" as const, sizeBytes: 4_000_000 };
describe("campaign references and calendar", () => {
  it("allows five files at the combined limit and rejects a sixth", () => {
    expect(validateReferences(Array(5).fill(file))).toBeNull();
    expect(validateReferences(Array(6).fill(file))).toBe("count");
  });
  it("rejects empty, oversized and combined oversized files", () => {
    expect(validateReferences([{ ...file, sizeBytes: 0 }])).toBe("size");
    expect(validateReferences([{ ...file, sizeBytes: 8_000_001 }])).toBe("size");
    expect(validateReferences(Array(3).fill({ ...file, sizeBytes: 8_000_000 }))).toBe("total");
  });
  it("does not read references from another workspace or through path traversal", () => {
    const root = "file:///private/campaign-briefs/user-a-workspace-a";
    expect(ownedReferenceUri(root, `${root}/123-abc.pdf`)).toBe(true);
    for (const uri of [`${root}/../other.pdf`, `${root}/%2e%2e%2fother.pdf`, `${root}-other/123.pdf`, "https://example.test/a.pdf"])
      expect(ownedReferenceUri(root, uri)).toBe(false);
  });
  it("keeps selected dates in Bahrain time and rejects invalid calendar dates", () => {
    expect(campaignStart("2026-10-04")).toBe("2026-10-03T21:00:00.000Z");
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
  });
  it("selects Bahrain's calendar day across UTC midnight without parsing a localized date string", () => {
    expect(bahrainDate(new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04");
    expect(bahrainDate(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
  });
});
