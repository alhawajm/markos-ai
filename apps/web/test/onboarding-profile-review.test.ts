import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const onboardingPath = fileURLToPath(new URL("../app/[locale]/_components/onboarding-panel.tsx", import.meta.url));
const source = readFileSync(onboardingPath, "utf8");

describe("first-time onboarding profile review", () => {
  it("groups the generated profile into scan-friendly expandable sections", () => {
    for (const heading of ["Business identity", "Brand information", "Audience", "Goals", "Tone and preferences"]) {
      expect(source).toContain(heading);
    }
    expect(source).toContain("aria-expanded={expanded}");
    expect(source).toContain("Review & edit");
    expect(source).toContain("line-clamp-3");
    expect(source).toContain("resize-none");
  });

  it("keeps approved Business Profile editing on the existing information-check path", () => {
    expect(source).toContain('if (editMode) return "review"');
    expect(source).toContain("finishEditMode()");
  });
});
