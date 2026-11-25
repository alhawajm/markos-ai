import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdir } from "node:fs/promises";
import { draft } from "./create-fixtures";
import { assertPlexFonts, assertRobotoFonts } from "./browser-fonts";
const base = process.env.SETTINGS_BROWSER_BASE_URL;
if (!base) throw new Error("SETTINGS_BROWSER_BASE_URL required");
let browser: Browser;
const uid = "00000000-0000-4000-8000-000000000001",
  wid = "00000000-0000-4000-8000-000000000002",
  pid = "00000000-0000-4000-8000-000000000003";
const profile = {
  businessName: "Pearl Bakery",
  ...Object.fromEntries(
    ["tagline", "overview", "uniqueValue", "offerSummary", "idealCustomer", "marketPosition", "brandVoice", "marketingFocus"].map((k) => [
      k,
      { en: "A friendly neighborhood bakery in Bahrain.", ar: "مخبز ودود في البحرين." }
    ])
  )
};
beforeAll(async () => {
  const executablePath =
    process.env.SETTINGS_BROWSER_EXECUTABLE ??
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    (process.platform === "win32" ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : undefined);
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true
  });
});
afterAll(async () => {
  await browser?.close();
});
it.each([
  { locale: "en", theme: "light", width: 1440, height: 900 },
  { locale: "en", theme: "dark", width: 1440, height: 900 },
  { locale: "ar", theme: "light", width: 390, height: 844 },
  { locale: "ar", theme: "dark", width: 390, height: 844 }
])(
  "quick setup, chat and progressive authoring $locale $theme",
  async (v) => {
    const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((theme) => localStorage.setItem("markos.theme", theme), v.theme);
    let status = "NOT_STARTED",
      businessProfile: object = { status: "NOT_GENERATED", interactionId: null, profile: null, updatedAt: null };
    const current = draft({ brief: "Morning bake", caption: "Freshly baked. طازج من الفرن." });
    let turns: object[] = [];
    const reply = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    const onboarding = () => ({
      status,
      businessProfile,
      modules: [],
      onboardingScore: 0,
      readyForProfile: false,
      vaultScore: { score: 0, entryCount: 0, completedSections: [] }
    });
    await page.route("**/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname,
        method = route.request().method();
      if (method === "OPTIONS") return route.fulfill({ status: 204 });
      if (path === "/v1/auth/refresh")
        return route.fulfill(
          reply({
            mfaVerified: true,
            mfaVerifiedUntil: null,
            roles: ["OWNER"],
            user: { id: uid, email: "owner@pearl.test", fullName: "Mariam", locale: v.locale, isVerified: true },
            workspace: { id: wid, name: "Pearl Bakery", slug: "pearl" },
            tokens: { accessToken: "fixture-only", expiresIn: 900 }
          })
        );
      if (path === "/v1/onboarding") return route.fulfill(reply(onboarding()));
      if (path === "/v1/business-profile")
        return route.fulfill(reply({ version: 1, approved: false, modules: { company: {}, audience: {}, brand: {}, objectives: {} }, catalog: null }));
      if (path === "/v1/onboarding/document-analysis") return route.fulfill(reply(null));
      if (path === "/v1/onboarding/quick/preview") {
        expect(route.request().postDataJSON().details.name).toBe("Pearl Bakery");
        businessProfile = { status: "DRAFT", interactionId: pid, profile, updatedAt: new Date().toISOString() };
        return route.fulfill(reply(onboarding()));
      }
      if (path === "/v1/onboarding/quick/confirm") {
        status = "COMPLETE";
        businessProfile = { ...businessProfile, status: "APPROVED" };
        return route.fulfill(reply(onboarding()));
      }
      if (path === "/v1/assistant/conversation" && method === "POST") {
        const body = route.request().postDataJSON();
        turns = [
          {
            id: body.requestId,
            message: body.message,
            reply: v.locale === "ar" ? "لننشئ منشورًا للمخبز." : "Let’s create a bakery post.",
            status: "PROPOSED",
            createdAt: new Date().toISOString(),
            confirmationToken: pid,
            proposal: {
              action: "CONTENT",
              summary: v.locale === "ar" ? "صورة دافئة ونص باللغتين." : "A warm bakery image and bilingual caption.",
              instruction: body.message,
              contentType: "POST",
              contentItemId: null,
              durationDays: null
            }
          }
        ];
        return route.fulfill(reply(turns[0]));
      }
      if (path === "/v1/assistant/chats") return route.fulfill(reply({ items: [], nextCursor: null }));
      if (/\/v1\/assistant\/chats\/[^/]+\/messages$/.test(path)) return route.fulfill(reply({ turns, nextBefore: null }));
      if (path === "/v1/assistant/conversation") return route.fulfill(reply(turns));
      if (path.startsWith("/v1/assistant/conversation/") && path.endsWith("/confirm")) {
        turns = [
          {
            ...(turns[0] as object),
            status: "COMPLETED",
            reply: v.locale === "ar" ? "بدأت العمل على المسودة." : "I’ve started your draft.",
            contentItemId: current.id
          }
        ];
        return route.fulfill(reply(turns[0]));
      }
      if (path === "/v1/media") return route.fulfill(reply([]));
      if (path.endsWith("/conversation")) return route.fulfill(reply({ id: null, contentItem: current, messages: [], latestRun: null }));
      if (path === "/v1/content/draft-1" || (path === "/v1/content" && method === "POST")) return route.fulfill(reply(current));
      if (path === "/v1/notifications") return route.fulfill(reply([]));
      if (path === "/v1/campaigns/summaries") return route.fulfill(reply({ items: [], nextCursor: null }));
      return route.fulfill(reply(null));
    });
    try {
      await page.goto(`${base}/${v.locale}/onboarding`);
      await page.getByRole("button", { name: v.locale === "ar" ? /أخبرني بالأساسيات/ : /Tell me the basics/ }).click();
      const fields = page.locator(".quick-setup-form input:not([type=file]),.quick-setup-form textarea");
      await fields.first().waitFor();
      expect(await fields.count()).toBe(6);
      await fields.nth(0).fill("Pearl Bakery");
      await fields.nth(1).fill("Fresh bread and pastries");
      await mkdir("../../var/ux-2026-11-15/screens", { recursive: true });
      await assertPlexFonts(page, [".quick-setup-card h1", ".quick-setup-form button"]);
      await page.screenshot({ path: `../../var/ux-2026-11-15/screens/manual-${v.locale}-${v.theme}.png`, fullPage: true });
      await page.getByRole("button", { name: v.locale === "ar" ? /ملخص/ : /Review my summary/ }).click();
      await page.getByRole("heading", { name: "Pearl Bakery" }).waitFor();
      await page.getByRole("button", { name: v.locale === "ar" ? /لنبدأ/ : /Looks good/ }).click();
      await page.waitForURL(`**/${v.locale}/app`);
      await page.locator(".workspace-chat").waitFor();
      expect(await page.locator(".workspace-chat-starters button").count()).toBe(4);
      await (v.locale === "en" ? assertRobotoFonts : assertPlexFonts)(page, [
        ".post-chat-welcome h1",
        ".post-chat-welcome p",
        ".workspace-chat-starters button"
      ]);
      await page.screenshot({ path: `../../var/ux-2026-11-15/screens/home-${v.locale}-${v.theme}.png`, fullPage: true });
      await page.locator("#home-message").fill(v.locale === "ar" ? "ساعدني في إعداد محتوى عن خبز الصباح." : "Help me prepare content about the morning bake.");
      await page.locator(".workspace-chat-composer [type=submit]").click();
      await page.locator(".workspace-chat-plan button").click();
      await page.getByRole("link", { name: v.locale === "ar" ? "فتح المسودة ←" : "Open draft →", exact: true }).click();
      await page.waitForURL("**/app/content-studio?item=draft-1");
      await page.getByRole("button", { name: v.locale === "ar" ? "تعديل يدوي" : "Edit manually" }).waitFor();
      expect(await page.getByLabel(v.locale === "ar" ? "نوع المحتوى" : "Content type").isVisible()).toBe(false);
      const preview = await page.locator(".create-primary-preview .studio-artwork-stage").boundingBox();
      expect(preview?.width).toBeGreaterThan(100);
      expect(preview?.height).toBeGreaterThan(200);
      await page.screenshot({ path: `../../var/ux-2026-11-15/screens/create-${v.locale}-${v.theme}.png`, fullPage: true });
      await page.getByRole("button", { name: v.locale === "ar" ? "تعديل يدوي" : "Edit manually" }).click();
      expect(await page.getByLabel(v.locale === "ar" ? "نوع المحتوى" : "Content type").isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  90000
);
