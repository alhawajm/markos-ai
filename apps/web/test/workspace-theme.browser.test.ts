import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalyticsSummary, BusinessKnowledgeRecord, CampaignSummary } from "@markos/shared-types";
import { draft } from "./create-fixtures";
import { assertPlexFonts } from "./browser-fonts";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;
let browser: Browser;

// Isolated presentation fixtures: these checks never contact a real workspace.
async function workspace(page: Page) {
  const errors: string[] = [];
  const unknown: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const session = {
    mfaVerified: true,
    mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
    tokens: { accessToken: "workspace-theme-fixture", expiresIn: 900 },
    user: { id: "theme-owner", email: "owner@example.test", fullName: "Theme Owner", locale: "en", isVerified: true },
    workspace: { id: "workspace-1", name: "Blooms in Pink", slug: "blooms" },
    roles: ["OWNER"]
  };
  const record = draft({ caption: "Blooms in Pink — join us for an evening of community and awareness." });
  const campaign: CampaignSummary = {
    id: "campaign-theme",
    workspaceId: "workspace-1",
    title: "Blooms in Pink",
    objective: "Introduce our community event",
    status: "REVIEW",
    startsAt: "2026-11-10T00:00:00Z",
    endsAt: "2026-11-24T00:00:00Z",
    durationDays: 14,
    publishesPerDay: 1,
    version: 1,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    postCounts: { total: 14, idea: 13, draft: 1, inReview: 0, ready: 0, scheduled: 0, published: 0, failed: 0 }
  };
  const knowledge: BusinessKnowledgeRecord = {
    version: 1,
    approved: true,
    updatedAt: "2026-11-01T10:00:00Z",
    catalog: null,
    modules: { company: { name: "Blooms in Pink" }, story: {}, audience: {}, competitors: {}, brand: {}, objectives: {} }
  };
  const totals = { comments: 0, engagement: 0, followers: 0, impressions: 0, likes: 0, profileViews: 0, reach: 0, saves: 0, shares: 0, views: 0 };
  const analytics: AnalyticsSummary = {
    days: 7,
    from: "2026-10-26",
    to: "2026-11-02",
    totals,
    daily: [],
    topContent: [],
    records: [],
    byMetricType: [],
    comparison: { from: "2026-10-19", to: "2026-10-25", totals, percentageChanges: totals }
  };
  await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
    roles: session.roles,
    user: session.user,
    workspace: session.workspace
  });
  await page.route("**/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let data: unknown;
    if (pathname === "/v1/auth/refresh") data = session;
    else if (pathname === "/v1/onboarding")
      data = {
        status: "COMPLETE",
        businessProfile: { status: "APPROVED" },
        modules: [],
        onboardingScore: 100,
        readyForProfile: true
      };
    else if (pathname === "/v1/workspace/instagram") data = { status: "CONNECTED", connected: true, username: "theme_fixture" };
    else if (pathname === "/v1/vault/score") data = { score: 100, entryCount: 8, completedSections: [], missingSections: [], requiredSections: [] };
    else if (pathname === "/v1/business-profile") data = knowledge;
    else if (pathname === "/v1/campaigns/summaries") data = { items: [campaign], nextCursor: null };
    else if (pathname === "/v1/content") data = [record];
    else if (pathname === "/v1/content/draft-1") data = record;
    else if (pathname === "/v1/media/video-capabilities") data = { motion: true, generatedFootage: false };
    else if (pathname.endsWith("/conversation")) data = { id: "theme-thread", contentItem: record, messages: [], latestRun: null };
    else if (pathname.endsWith("/media-generation/latest") || pathname.endsWith("/publish-job/latest")) data = null;
    else if (pathname === "/v1/calendar")
      data = {
        range: { from: url.searchParams.get("from"), to: url.searchParams.get("to") },
        items: [],
        mediaAssets: [],
        summary: { scheduledThisWeek: 0, ready: 0, needsAttention: 1 },
        unscheduled: { items: [record], total: 1 }
      };
    else if (pathname === "/v1/analytics") data = analytics;
    else if (pathname === "/v1/account")
      data = {
        user: { ...session.user, mfaEnabled: true },
        workspace: { ...session.workspace, ownerUserId: session.user.id }
      };
    else if (pathname === "/v1/workspace/team") data = { ownerUserId: session.user.id, members: [], invitations: [] };
    else if (pathname === "/v1/workspaces") data = [{ ...session.workspace, ownerUserId: session.user.id, roles: session.roles }];
    else if (pathname === "/v1/auth/mfa/totp") data = { enabled: true };
    else if (pathname === "/v1/billing/summary") data = { invoices: [], payments: [] };
    else if (pathname === "/v1/notifications/preferences") data = { pushEnabled: false, monthlyEmailEnabled: false };
    else if (
      ["/v1/notifications", "/v1/media", "/v1/publishing/queue", "/v1/campaigns/generations", "/v1/vault", "/v1/workspace/audit-logs"].includes(pathname)
    )
      data = [];
    else {
      unknown.push(pathname);
      return route.fulfill({ status: 404, body: "Missing theme fixture" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  return { errors, unknown };
}

describe("whole-workspace appearance", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
    });
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each([
    { locale: "en", mode: "light", width: 1440 },
    { locale: "en", mode: "dark", width: 1440 },
    { locale: "ar", mode: "light", width: 1440 },
    { locale: "ar", mode: "dark", width: 1440 },
    { locale: "en", mode: "light", width: 390 },
    { locale: "ar", mode: "dark", width: 390 }
  ] as const)(
    "keeps pages, editor tabs and navigation consistent ($locale $mode $width)",
    async ({ locale, mode, width }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.setDefaultTimeout(12_000);
      page.setDefaultNavigationTimeout(45_000);
      const observed = await workspace(page);
      const routes = ["", "/campaigns", "/content-studio", "/calendar", "/analytics", "/knowledge", "/settings#appearance"];
      try {
        for (const route of routes) {
          await page.goto(`${baseUrl}/${locale}/app${route}${route === "/content-studio" ? "?item=draft-1" : ""}`, { waitUntil: "networkidle" });
          await expect.poll(() => page.locator("html").getAttribute("data-theme"), { message: route }).toBe(mode);
          await page
            .locator(route === "/content-studio" ? ".create-workspace" : "h1")
            .first()
            .waitFor();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
          const selected = page.locator(
            width >= 1024 ? '#markos-primary-navigation a[aria-current="page"]' : 'nav a.brand-nav-item[aria-current="page"]:visible'
          );
          if (!route.startsWith("/settings")) {
            await expect.poll(() => selected.count(), { message: route }).toBe(1);
            const styles = await selected.evaluate((el) => {
              const root = getComputedStyle(document.documentElement);
              const canvas = new OffscreenCanvas(1, 1).getContext("2d")!;
              canvas.fillStyle = root.getPropertyValue("--selected");
              const expectedBackground = canvas.fillStyle;
              canvas.fillStyle = getComputedStyle(el).backgroundColor;
              return { background: canvas.fillStyle, expectedBackground, color: getComputedStyle(el).color, text: root.getPropertyValue("--text").trim() };
            });
            expect(styles.background, route).toBe(styles.expectedBackground);
            expect(styles.color, route).toBe(mode === "dark" ? "rgb(247, 240, 243)" : "rgb(38, 54, 64)");
          }
          if (route === "/content-studio") {
            for (const label of locale === "ar" ? ["النص", "التفاصيل", "الوسائط"] : ["Caption", "Details", "Media"]) {
              const tab = page.locator(".create-toolbar").getByRole("button", { name: label, exact: true });
              await tab.click();
              expect(await tab.getAttribute("aria-current")).toBe("page");
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            }
          }
          await page.mouse.move(0, 0);
          await page.evaluate(() => document.fonts.ready);
          await assertPlexFonts(page, [route === "/content-studio" ? ".create-toolbar button" : "h1"]);
          if (screenshotDir)
            await page.screenshot({
              path: path.join(screenshotDir, `${locale}-${mode}-${width}-${route.replace(/[^a-z]+/g, "-") || "overview"}.png`),
              fullPage: true
            });
        }
        expect(observed.unknown).toEqual([]);
        expect(observed.errors).toEqual([]);
      } finally {
        await context.close();
      }
    },
    180_000
  );
});
