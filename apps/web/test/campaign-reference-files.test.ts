import { describe, expect, it } from "vitest";
import { addCampaignReferenceFiles } from "../app/[locale]/_components/campaign-reference-files";

const file = (name: string, size = 100) => ({ name, size, lastModified: 1 }) as File;
describe("campaign reference selection", () => {
  it("accepts five supported files and deduplicates a repeated selection", () => {
    const files = [file("Proposal.pdf"), file("Details.docx"), file("Notes.txt"), file("Design.PNG"), file("Mood.jpg")];
    expect(addCampaignReferenceFiles(files, [files[0]!])).toEqual(files);
    expect(addCampaignReferenceFiles([], files)).toHaveLength(5);
  });
  it("keeps the previous selection when a sixth or unsupported file is chosen", () => {
    const files = Array.from({length: 5}, (_, i) => file(`${i}.pdf`));
    expect(() => addCampaignReferenceFiles(files, [file("sixth.pdf")])).toThrow("filesTooMany");
    expect(files).toHaveLength(5);
    expect(() => addCampaignReferenceFiles([], [file("script.exe")])).toThrow("filesUnsupported");
  });
  it("enforces per-file and combined limits before reading file bytes", () => {
    expect(() => addCampaignReferenceFiles([], [file("empty.txt", 0)])).toThrow("fileTooLarge");
    expect(() => addCampaignReferenceFiles([], [file("large.pdf", 8_000_001)])).toThrow("fileTooLarge");
    expect(() => addCampaignReferenceFiles([], [file("a.pdf", 8_000_000), file("b.pdf", 8_000_000), file("c.pdf", 5_000_000)])).toThrow("filesTotalTooLarge");
  });
});
