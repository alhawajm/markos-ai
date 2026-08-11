import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const settingsPath = fileURLToPath(new URL("../app/[locale]/design-preview/settings-preview.tsx", import.meta.url));
const settingsStylesPath = fileURLToPath(new URL("../app/[locale]/design-preview/settings-preview.module.css", import.meta.url));
const sunlitThemePath = fileURLToPath(new URL("../app/sunlit-theme.css", import.meta.url));
const navigationPath = fileURLToPath(new URL("../app/[locale]/design-preview/section-navigation.tsx", import.meta.url));
const navigationStylesPath = fileURLToPath(new URL("../app/[locale]/design-preview/section-navigation.module.css", import.meta.url));
const legalPath = fileURLToPath(new URL("../app/[locale]/design-preview/legal-document-preview.tsx", import.meta.url));

const settingsSource = readFileSync(settingsPath, "utf8");
const settingsStyles = readFileSync(settingsStylesPath, "utf8");
const sunlitTheme = readFileSync(sunlitThemePath, "utf8");
const navigationSource = readFileSync(navigationPath, "utf8");
const navigationStyles = readFileSync(navigationStylesPath, "utf8");
const legalSource = readFileSync(legalPath, "utf8");

describe("Sunlit Settings design preview", () => {
  it("uses the approved six-section information architecture", () => {
    for (const section of ["Account", "Business profile", "Connections", "Security", "Plan & billing", "Team & data"]) {
      expect(settingsSource).toContain(section);
    }

    expect(settingsSource).toContain("SettingsContentSection");
    expect(settingsSource).toContain('active={selectedSection === "account"}');
    expect(settingsSource).not.toContain("SettingsAccordionSection");
    expect(settingsSource).not.toContain("aria-expanded={expanded}");
    expect(settingsSource).toContain("أقسام الإعدادات");
    expect(settingsSource).toContain('dir={isArabic ? "rtl" : "ltr"}');
  });

  it("keeps Instagram visible but guarded until MFA is available", () => {
    expect(settingsSource).toContain("MFA required");
    expect(settingsSource).toContain("Secure my account");
    expect(settingsSource).toContain("Before you connect");
    expect(settingsSource).toContain("Set up two-step verification");
    expect(settingsSource).toContain('locked: id === "connections"');
    expect(settingsSource).not.toContain("@markos/api-client");
    expect(settingsSource).not.toContain("fetch(");
  });

  it("shares persistent section navigation with the legal documents", () => {
    expect(navigationSource).toContain("data-section-navigation");
    expect(navigationSource).toContain('window.addEventListener("scroll"');
    expect(navigationSource).toContain("reachedDocumentEnd");
    expect(navigationSource).toContain("items.at(-1)");
    expect(navigationStyles).toContain("position: sticky");
    expect(navigationStyles).toContain(".mobileMenu");
    expect(legalSource).toContain("<SectionNavigation");
    expect(settingsSource).toContain("<SectionNavigation");
  });

  it("keeps muted and locked content readable in the bright theme", () => {
    expect(settingsSource).toContain("sunlit-theme");
    expect(sunlitTheme).toContain("--sunlit-ink-soft: #4d4853");
    expect(settingsStyles).toContain(".lockedConnection");
    expect(settingsStyles).toContain(".disabledButton");
    expect(sunlitTheme).toContain("color-scheme: light");
  });
});
