import { afterEach, describe, expect, it, vi } from "vitest";
import { captionCharacterCount } from "@markos/shared-types";
import { contentCaptionSchema, createContentSchema, updateContentSchema } from "@markos/validation";
import { buildCaption } from "../src/publishing/instagram-publisher";
import { generateContentDrafts } from "../src/ai/content-client";

vi.mock("../src/admin/model-settings-service", () => ({ resolveModelSetting: async () => "test-model" }));
afterEach(() => vi.unstubAllGlobals());

const captions = [
  "",
  "English only",
  "العربية فقط",
  "  Orange 🍊\n\nبرتقال\n\nMessage us. راسلنا.\n\n#Bahrain #البحرين\n",
  "#Bahrain\nالعربية أولاً\n\nEnglish follows."
];

describe("one publication caption", () => {
  it.each(captions)("preserves complete copy through validation and publisher: %j", (caption) => {
    expect(contentCaptionSchema.parse(caption)).toBe(caption);
    expect(createContentSchema.parse({ caption }).caption).toBe(caption);
    expect(updateContentSchema.parse({ caption }).caption).toBe(caption);
    expect(buildCaption({ caption })).toBe(caption);
  });

  it("validates the combined caption without truncating emoji or rebuilding hashtags", () => {
    const maximum = "🍊".repeat(2200);
    expect(captionCharacterCount(maximum)).toBe(2200);
    expect(contentCaptionSchema.parse(maximum)).toBe(maximum);
    expect(contentCaptionSchema.safeParse(`${maximum}x`).success).toBe(false);
    const tooManyTags = Array.from({ length: 31 }, (_, i) => `#وسم${i}`).join(" ");
    expect(contentCaptionSchema.safeParse(tooManyTags).success).toBe(false);
    expect(() => buildCaption({ caption: tooManyTags })).toThrow("INSTAGRAM_CAPTION_TOO_MANY_HASHTAGS");
    expect(() => buildCaption({ caption: "a".repeat(2201) })).toThrow("INSTAGRAM_CAPTION_TOO_LONG");
  });

  it("rejects retired fields so stale clients cannot silently save partial copy", () => {
    for (const key of ["captionEn", "captionAr", "callToAction", "hashtags"]) {
      const payload = { caption: "Keep this", [key]: key === "hashtags" ? ["#Old"] : "Old split copy" };
      expect(createContentSchema.safeParse(payload).success).toBe(false);
      expect(updateContentSchema.safeParse(payload).success).toBe(false);
    }
  });

  const request = {
    workspaceId: "caption-test",
    topic: "Introduce citrus",
    contentType: "POST",
    count: 1,
    context: [],
    toneLock: { preferredLanguages: ["en", "ar"] as Array<"en" | "ar">, toneWords: [], brandHints: {} }
  };

  it("passes the full manual caption to revision and validates the returned caption", async () => {
    const caption = captions[3]!;
    let sent: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, options: RequestInit) => {
        sent = JSON.parse(options.body as string);
        return Response.json({
          model: "test-model",
          prompt_version: "content.v3.test",
          tokens_in: 10,
          tokens_out: 5,
          drafts: [{ contentType: "POST", caption: "برتقال\n\nOrange", contentPillar: null, visualDirection: null, carousel: null, reelScript: null }]
        });
      })
    );
    const result = await generateContentDrafts({
      ...request,
      revision: { instruction: "Arabic first; remove CTA and hashtags", currentDraft: { contentType: "POST", caption } }
    });
    expect(sent?.current_draft).toEqual({ contentType: "POST", caption, contentPillar: null, carousel: null, reelScript: null });
    expect(result.drafts).toEqual([{ contentType: "POST", caption: "برتقال\n\nOrange" }]);
  });

  it.each(["a".repeat(2201), Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ")])(
    "rejects invalid AI output before it can be persisted",
    async (caption) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ model: "test-model", prompt_version: "content.v3.test", tokens_in: 10, tokens_out: 5, drafts: [{ contentType: "POST", caption }] })
        )
      );
      await expect(generateContentDrafts(request)).rejects.toMatchObject({ code: "AI_SERVICE_RESPONSE_INVALID", retryable: true });
    }
  );
});
