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
    expect(contentDraftIsDirty(baseline, baseline)).toBe(false);
    expect(contentDraftHasMeaningfulWork({ ...baseline, caption: "   " })).toBe(false);
    expect(contentDraftIsDirty({ ...baseline, caption: "   " }, baseline)).toBe(true);
  });

  it("treats copy or a planned time as meaningful manual work", () => {
    const baseline = emptyContentDraftFields();

    expect(contentDraftHasMeaningfulWork({ ...baseline, caption: "A useful caption" })).toBe(true);
    expect(contentDraftHasMeaningfulWork({ ...baseline, plannedAtInput: "2026-08-28T18:30" })).toBe(true);
  });

  it("preserves the exact complete caption while normalizing planning fields", () => {
    const caption = "  Hello Bahrain 🍊\n\nأهلاً بالبحرين\n\nSend a message\n\n#launch #Bahrain  \n";
    const payload = contentDraftPayload({
      ...emptyContentDraftFields(),
      caption,
      plannedAtInput: "2026-08-28T18:30"
    });

    expect(payload).toEqual({
      brief: null,
      caption,
      campaignGoal: null,
      contentPillar: null,
      contentType: "POST",
      plannedAt: "2026-08-28T15:30:00.000Z",
      visualDirection: null,
      tone: null
    });
  });

  it("hydrates saved content using Bahrain local time", () => {
    const record: ContentRecord = {
      revision: 1,
      caption: "Draft\n\nمسودة\n\nVisit us\n\n#Bahrain #Markos",
      contentType: "POST",
      createdAt: "2026-08-25T10:00:00.000Z",
      id: "content-1",
      mediaIds: [],
      plannedAt: "2026-08-28T15:30:00.000Z",
      status: "DRAFT",
      updatedAt: "2026-08-25T10:00:00.000Z",
      workspaceId: "workspace-1"
    };

    expect(contentDraftFieldsFromRecord(record)).toMatchObject({
      caption: record.caption,
      plannedAtInput: "2026-08-28T18:30"
    });
    expect(bahrainInputValue(record.plannedAt!)).toBe("2026-08-28T18:30");
    expect(plannedAtInputToIso("2026-08-28T18:30")).toBe(record.plannedAt);
  });
});
