import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalyticsMetricTotals, AnalyticsSummary } from "@markos/shared-types";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered UI refinement tests");
let browser: Browser;
const session = {
  mfaVerified: true,
  tokens: { accessToken: "ui-fixture-only", expiresIn: 900 },
  user: { id: "ui-owner", email: "owner@example.test", fullName: "SnackLab Owner", locale: "en", isVerified: true },
  workspace: { id: "ui-workspace", name: "SnackLab", slug: "snacklab" },
  roles: ["OWNER"]
};
const totals: AnalyticsMetricTotals = {
  comments: 0,
  engagement: 32,
  followers: 90,
  impressions: 240,
  likes: 20,
  profileViews: 7,
  reach: 120,
  saves: 3,
  shares: 9,
  views: 250
};
function summary(populated: boolean): AnalyticsSummary {
  return {
    days: 7,
    from: "2026-09-03",
    to: "2026-09-10",
    totals,
    comparison: { from: "2026-08-27", to: "2026-09-02", totals: { ...totals, reach: 100 }, percentageChanges: { ...totals, reach: 20 } },
    byMetricType: populated ? [{ metricType: "POST", totals }] : [],
    daily: populated ? [{ dataDate: "2026-09-09", totals }] : [],
    latestSyncedAt: "2026-09-10T09:00:00Z",
    records: populated
      ? [
          {
            id: "metric",
            workspaceId: session.workspace.id,
            metricType: "POST",
            contentItemId: "draft",
            dataDate: "2026-09-09",
            metrics: {},
            syncedAt: "2026-09-10T09:00:00Z",
            createdAt: "2026-09-10T09:00:00Z",
            updatedAt: "2026-09-10T09:00:00Z"
          }
        ]
      : [],
    topContent: populated
      ? [{ contentItemId: "draft", contentType: "POST", caption: "Orange-cardamom launch", dataDate: "2026-09-09", engagement: 32, metrics: totals }]
      : []
  };
}

async function fixture(page: Page, populated = false) {
  const requests: string[] = [];
  const unknown: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
    user: session.user,
    workspace: session.workspace,
    roles: session.roles
  });
  await page.route(/^http:\/\/(localhost|127\.0\.0\.1):4000\//, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    let data: unknown;
    if (url.pathname === "/v1/auth/refresh") data = session;
    else if (url.pathname === "/v1/onboarding") data = { status: "COMPLETE", businessProfile: { status: "APPROVED" } };
    else if (url.pathname === "/v1/vault/score") data = { score: 100, completedSections: [], requiredSections: [], missingSections: [], entryCount: 8 };
    else if (url.pathname === "/v1/notifications" || url.pathname === "/v1/publishing/queue") data = [];
    else if (url.pathname === "/v1/content")
      data = ["DRAFT", "FAILED"].map((status, index) => ({
        id: index ? "failed" : "draft",
        workspaceId: session.workspace.id,
        platform: "INSTAGRAM",
        contentType: "POST",
        caption: index ? "Bakery launch" : "Orange-cardamom launch",
        status,
        mediaIds: [],
        revision: 1,
        createdAt: "2026-09-09T09:00:00Z",
        updatedAt: "2026-09-09T09:00:00Z"
      }));
    else if (url.pathname === "/v1/analytics") data = summary(populated);
    else if (url.pathname === "/v1/analytics/monthly-pdf")
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\nUI fixture report\n%%EOF" });
    else {
      unknown.push(url.pathname);
      return route.fulfill({ status: 404, body: "Unknown fixture endpoint" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  return { requests, unknown, errors };
}

describe("refined overview and Insights", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
    });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("keeps failed work visible and gives each item one readable status in both themes and locales", async () => {
    for (const locale of ["en", "ar"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const observed = await fixture(page);
      try {
        await page.goto(`${baseUrl}/${locale}/app`, { waitUntil: "networkidle" });
        await page.locator('[data-content-status="FAILED"]').waitFor();
        for (const theme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme: theme });
          await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(theme);
          expect(await page.locator('[data-content-status="DRAFT"]').count()).toBe(1);
          expect(await page.locator('[data-content-status="FAILED"]').textContent()).toBe(locale === "ar" ? "تعذّر النشر" : "Failed");
          const sizes = await page.locator('[data-content-status="FAILED"]').evaluate((el) => ({
            status: parseFloat(getComputedStyle(el).fontSize),
            root: parseFloat(getComputedStyle(document.documentElement).fontSize),
            overflow: document.documentElement.scrollWidth > innerWidth
          }));
          expect(sizes.status).toBeGreaterThanOrEqual(13);
          expect(sizes.root).toBe(16);
          expect(sizes.overflow).toBe(false);
        }
        await page.evaluate(() => document.fonts.ready);
        const cdp = await context.newCDPSession(page);
        await cdp.send("DOM.enable");
        await cdp.send("CSS.enable");
        const { root } = await cdp.send("DOM.getDocument");
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "h1" });
        const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
        expect(
          fonts.some((font) => font.isCustomFont && font.familyName.startsWith(locale === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans")),
          JSON.stringify({ locale, fonts })
        ).toBe(true);
        expect(observed.unknown).toEqual([]);
        expect(observed.errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });

  it("shows one useful Insights empty state without zero metric or comparison cards", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    const page = await context.newPage();
    const observed = await fixture(page);
    try {
      await page.goto(`${baseUrl}/en/app/analytics`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "No synced insights yet" }).waitFor();
      expect(await page.getByRole("heading", { name: "Period comparison" }).count()).toBe(0);
      expect(await page.getByText("No prior-period data", { exact: true }).count()).toBe(0);
      expect(await page.getByRole("link", { name: "Instagram settings" }).getAttribute("href")).toBe("/en/app/settings#connections");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(observed.unknown).toEqual([]);
      expect(observed.errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it("retains populated metrics, period filtering, content links and report export", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await context.newPage();
    const observed = await fixture(page, true);
    try {
      await page.goto(`${baseUrl}/en/app/analytics`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Performance trend" }).waitFor();
      expect(await page.getByRole("link", { name: /Orange-cardamom launch/ }).getAttribute("href")).toBe("/en/app/content-studio?item=draft");
      expect(await page.getByRole("heading", { name: "No synced insights yet" }).count()).toBe(0);
      await page.getByRole("button", { name: "30 days", exact: true }).click();
      await expect.poll(() => observed.requests.some((value) => value.includes("/v1/analytics?days=30"))).toBe(true);
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export monthly report", exact: true }).click();
      expect((await downloaded).suggestedFilename()).toMatch(/markos-insights-.*\.pdf$/);
      await page.getByRole("status").getByText("Monthly report downloaded.", { exact: true }).waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(observed.unknown).toEqual([]);
      expect(observed.errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
