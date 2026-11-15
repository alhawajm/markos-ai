import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered onboarding tests");

const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;
let browser: Browser;

describe("first-time onboarding profile review", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  });

  afterAll(async () => browser?.close());

  it.each([
    { locale: "en", theme: "light" },
    { locale: "en", theme: "dark" },
    { locale: "ar", theme: "light" },
    { locale: "ar", theme: "dark" }
  ] as const)("keeps the short summary and six-answer adjustment readable in $locale / $theme", async ({ locale, theme }) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 }, colorScheme: theme });
    const page = await context.newPage();
    await mockApi(page);
    try {
      await page.goto(baseUrl + "/" + locale + "/onboarding");
      await page.getByRole("heading", { level: 1, name: locale === "ar" ? "هذا ما فهمته عن نشاطك." : "Here’s what I understand." }).waitFor();
      expect(await page.locator(".quick-setup-summary input,.quick-setup-summary textarea").count()).toBe(0);
      expect(await page.locator(".quick-setup-summary>div").count()).toBe(4);
      await page.getByRole("button", { name: locale === "ar" ? "تعديل الأساسيات" : "Adjust the basics" }).click();
      const fields = page.locator(".quick-setup-form input,.quick-setup-form textarea");
      expect(await fields.count()).toBe(6);
      const revised = locale === "ar" ? "الوصول إلى عملاء جدد." : "Reach more local customers.";
      await fields.nth(5).fill(revised);
      await fields.nth(0).focus();
      expect(await fields.nth(5).inputValue()).toBe(revised);
      const layout = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        rootSize: getComputedStyle(document.documentElement).fontSize,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      }));
      expect(layout).toEqual({ theme, rootSize: "16px", overflow: false });
      if (screenshotDir) {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "onboarding-profile-review-" + locale + "-" + theme + ".png") });
      }
    } finally {
      await context.close();
    }
  });
});

async function mockApi(page: Page) {
  await page.route("**/v1/**", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/v1/auth/refresh") return route.fulfill(json(session()));
    if (pathname === "/v1/onboarding") return route.fulfill(json(onboardingState()));
    if (pathname === "/v1/business-profile")
      return route.fulfill(json({ version: 1, approved: false, modules: { company: {}, audience: {}, brand: {}, objectives: {} }, catalog: null }));
    if (pathname === "/v1/vault") return route.fulfill(json([]));
    if (pathname === "/v1/onboarding/products/document-analysis") return route.fulfill(json(null));
    if (pathname === "/v1/onboarding/document-analysis") return route.fulfill(json(null));
    return route.fulfill(json([]));
  });
}

function session() {
  return {
    mfaVerified: true,
    mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
    roles: ["OWNER"],
    tokens: { accessToken: "onboarding-profile-token", expiresIn: 900 },
    user: { email: "owner@example.com", fullName: "Owner", id: "owner-1", isVerified: true, locale: "en" },
    workspace: { id: "workspace-1", name: "Sunlit Studio", slug: "sunlit-studio" }
  };
}

function onboardingState() {
  const profileText = (en: string, ar: string) => ({ en, ar });
  const profile = {
    businessName: "Sunlit Studio",
    tagline: profileText("Bright ideas, made practical.", "أفكار مشرقة تصبح واقعاً."),
    overview: profileText(
      "Sunlit Studio helps small businesses plan and create consistent social content without losing their own voice.",
      "يساعد استوديو صن لِت الأنشطة الصغيرة على تخطيط محتوى اجتماعي متسق وإنشائه مع الحفاظ على صوتها الخاص."
    ),
    uniqueValue: profileText("Agency-quality planning with owner-level control.", "تخطيط بجودة الوكالات مع تحكم كامل لصاحب النشاط."),
    offerSummary: profileText(
      "Campaign planning, content creation, scheduling, and performance insights.",
      "تخطيط الحملات وإنشاء المحتوى وجدولته وتحليل أدائه."
    ),
    idealCustomer: profileText(
      "Bahrain-based founders and small teams growing through Instagram.",
      "المؤسسون والفرق الصغيرة في البحرين الذين ينمون عبر إنستغرام."
    ),
    marketPosition: profileText("An approachable AI marketing partner for growing local brands.", "شريك تسويق ذكي وسهل للعلامات المحلية النامية."),
    brandVoice: profileText("Clear, warm, optimistic, and practical.", "واضح ودافئ ومتفائل وعملي."),
    marketingFocus: profileText(
      "Build a consistent presence and convert attention into qualified enquiries.",
      "بناء حضور متسق وتحويل الاهتمام إلى استفسارات مؤهلة."
    )
  };
  return {
    businessProfile: { interactionId: "interaction-1", profile, status: "DRAFT", updatedAt: "2026-09-03T00:00:00.000Z" },
    modules: ["company", "story", "products", "audience", "competitors", "brand", "objectives"].map((module) => ({
      completed: true,
      module,
      sections: [],
      skipped: false
    })),
    onboardingScore: 100,
    readyForProfile: true,
    status: "IN_PROGRESS",
    vaultScore: { completedSections: [], entryCount: 7, missingSections: [], requiredSections: [], score: 100 }
  };
}

function json(data: unknown) {
  return { body: JSON.stringify({ data }), contentType: "application/json", status: 200 };
}
