import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(new URL("../app/[locale]/design-preview/sunlit-landing-preview.tsx", import.meta.url));
const stylesPath = fileURLToPath(new URL("../app/[locale]/design-preview/sunlit-landing-preview.module.css", import.meta.url));
const componentSource = readFileSync(componentPath, "utf8");
const stylesSource = readFileSync(stylesPath, "utf8");

describe("Sunlit Social Studio landing preview", () => {
  it("presents an adaptable workflow without a working-mode setup or embedded pricing", () => {
    expect(componentSource).toContain("Get the help you need with");
    expect(componentSource).toContain("planning, content, publishing, and insights");
    expect(componentSource).toContain('role="tablist"');
    expect(componentSource).toContain('role="tab"');
    expect(componentSource).toContain('role="tabpanel"');
    expect(componentSource).toContain("ArrowRight");
    expect(componentSource).toContain("ArrowLeft");
    expect(componentSource).not.toContain("How would you like to work");
    expect(componentSource).not.toContain("Manage it for me");
    expect(componentSource).not.toContain("BHD 18");
    expect(componentSource).not.toContain("Design preview");
    expect(componentSource).toContain("const signupHref = `/${locale}/design-preview/signup`");
  });

  it("labels illustrative insights and provides the agreed footer information", () => {
    expect(componentSource).toContain("Illustrative example");
    expect(componentSource).toContain("Example data");
    expect(componentSource).toContain("Weekly reach");
    expect(componentSource).toContain("What MARKOS noticed");
    expect(componentSource).toContain("Terms of Service");
    expect(componentSource).toContain("Privacy Policy");
    expect(componentSource).toContain("FAQs");
    expect(componentSource).toContain("Powered by Ra'edat Software");
    expect(componentSource).toContain("© 2026 Ra'edat Software L.L.C.");
  });

  it("declares a localized RTL experience with mirrored directional affordances", () => {
    expect(componentSource).toContain('dir={isArabic ? "rtl" : "ltr"}');
    expect(componentSource).toContain("احصل على الدعم الذي تحتاجه");
    expect(componentSource).toContain("الرؤى");
    expect(componentSource).toContain("بيانات توضيحية");
    expect(componentSource).toContain("مثال توضيحي");
    expect(componentSource).toContain('isArabic ? "/en/design-preview" : "/ar/design-preview"');
    expect(stylesSource).toContain('.previewPage[dir="rtl"] .directionalIcon');
    expect(stylesSource).toContain("transform: scaleX(-1)");
  });
});
