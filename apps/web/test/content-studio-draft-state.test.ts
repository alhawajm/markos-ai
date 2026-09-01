import { describe, expect, it } from "vitest";
import type { ContentRecord } from "@markos/shared-types";
import {
  bahrainInputValue,
  contentDraftFieldsFromRecord,
  contentDraftHasMeaningfulWork,
  contentDraftIsDirty,
  contentDraftPayload,
  emptyContentDraftFields,
  plannedAtInputToIso
} from "../app/[locale]/_components/content-studio-draft-state";

describe("content studio draft state", () => {
  it("does not treat an untouched blank post as work or a dirty draft", () => {
    const baseline = emptyContentDraftFields();

    expect(contentDraftHasMeaningfulWork(baseline)).toBe(false);
    expect(contentDraftIsDirty({ ...baseline, captionEn: "   " }, baseline)).toBe(false);
  });

  it("treats copy or a planned time as meaningful manual work", () => {
    const baseline = emptyContentDraftFields();

    expect(contentDraftHasMeaningfulWork({ ...baseline, captionEn: "A useful caption" })).toBe(true);
    expect(contentDraftHasMeaningfulWork({ ...baseline, plannedAtInput: "2026-08-28T18:30" })).toBe(true);
  });

  it("normalizes a populated draft into the create and update payload", () => {
    const payload = contentDraftPayload({
      ...emptyContentDraftFields(),
      callToAction: "  Send a message  ",
      captionAr: "  أهلاً بالبحرين  ",
      captionEn: "  Hello Bahrain  ",
      hashtagsText: "launch, #Bahrain launch",
      plannedAtInput: "2026-08-28T18:30"
    });

    expect(payload).toEqual({
      callToAction: "Send a message",
      captionAr: "أهلاً بالبحرين",
      captionEn: "Hello Bahrain",
      contentType: "POST",
      hashtags: ["#launch", "#Bahrain"],
      plannedAt: "2026-08-28T15:30:00.000Z"
    });
  });

  it("hydrates saved content using Bahrain local time", () => {
    const record: ContentRecord = {
      callToAction: "Visit us",
      captionAr: "مسودة",
      captionEn: "Draft",
      contentType: "POST",
      createdAt: "2026-08-25T10:00:00.000Z",
      hashtags: ["#Bahrain", "#Markos"],
      id: "content-1",
      mediaIds: [],
      plannedAt: "2026-08-28T15:30:00.000Z",
      status: "DRAFT",
      updatedAt: "2026-08-25T10:00:00.000Z",
      workspaceId: "workspace-1"
    };

    expect(contentDraftFieldsFromRecord(record)).toMatchObject({
      hashtagsText: "#Bahrain #Markos",
      plannedAtInput: "2026-08-28T18:30"
    });
    expect(bahrainInputValue(record.plannedAt!)).toBe("2026-08-28T18:30");
    expect(plannedAtInputToIso("2026-08-28T18:30")).toBe(record.plannedAt);
  });
});
