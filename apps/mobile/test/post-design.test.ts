import { describe, expect, it } from "vitest";
import { recommendPostTemplates } from "@markos/shared-types";
import { canPublishPostRatio, postOverlayCopy, requestsPostDesign } from "../src/post-design/model";

describe("chat post design", () => {
  it("uses the guided post path without taking campaign and reel requests from general chat", () => {
    expect(requestsPostDesign("Design a post with my picture")).toBe(true);
    expect(requestsPostDesign("صمم لي منشوراً عن ساعات العمل")).toBe(true);
    expect(requestsPostDesign("Create a campaign with daily posts")).toBe(false);
    expect(requestsPostDesign("Create a Reel post")).toBe(false);
  });
  it("preserves Arabic copy and keeps the taller share format away from automatic publishing", () => {
    expect(postOverlayCopy("متجر الحرف\n٨ صباحاً حتى ١٠ مساءً")).toEqual({ title: "متجر الحرف", detail: "٨ صباحاً حتى ١٠ مساءً" });
    expect(canPublishPostRatio("3:4")).toBe(false);
    expect(canPublishPostRatio("4:5")).toBe(true);
  });
  it("ranks templates by what the user asks for", () => {
    expect(recommendPostTemplates("Show our opening hours")[0]?.id).toBe("opening");
    expect(recommendPostTemplates("إعلان فعالية")[0]?.id).toBe("event");
  });
});
