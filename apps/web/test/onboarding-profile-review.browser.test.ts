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

  it("shows grouped previews and expands a field for editing without changing edit mode", async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    await mockApi(page);

    await page.goto(`${baseUrl}/en/onboarding`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Review your business profile" }).waitFor();

    for (const name of ["Business identity", "Brand information", "Audience", "Goals", "Tone and preferences"]) {
      await expect(page.getByRole("heading", { level: 2, name }).isVisible()).resolves.toBe(true);
    }

    const overviewButton = page.locator('button[aria-controls="profile-overview-en-content"]');
    await expect(overviewButton.getAttribute("aria-expanded")).resolves.toBe("false");
    await overviewButton.click();
    const overview = page.getByLabel("Business overview");
    await overview.waitFor();
    await expect(overviewButton.getAttribute("aria-expanded")).resolves.toBe("true");
    await expect(overview.evaluate((element) => getComputedStyle(element).resize)).resolves.toBe("none");

    if (screenshotDir) await page.screenshot({ fullPage: true, path: path.join(screenshotDir, "phase2-onboarding-profile-review.png") });
    await context.close();
  });
});

async function mockApi(page: Page) {
  await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/v1/auth/refresh") return route.fulfill(json(session()));
    if (pathname === "/v1/onboarding") return route.fulfill(json(onboardingState()));
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
