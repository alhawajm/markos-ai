import { chromium, type Browser } from "playwright-core";
import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdir } from "node:fs/promises";
import type { WorkspaceAssistantTurn } from "@markos/shared-types";
const base = process.env.SETTINGS_BROWSER_BASE_URL;
if (!base) throw Error("SETTINGS_BROWSER_BASE_URL required");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  await mkdir("../../var/ui-motion-2026-11-15/screens", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});
it.each([
  { locale: "en", theme: "light", width: 1440, reduced: false },
  { locale: "en", theme: "dark", width: 1440, reduced: false },
  { locale: "ar", theme: "dark", width: 390, reduced: true }
] as const)(
  "honest activity and campaign handoff $locale $theme",
  async (v) => {
    const context = await browser.newContext({
      viewport: { width: v.width, height: 900 },
      colorScheme: v.theme,
      reducedMotion: v.reduced ? "reduce" : "no-preference"
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const session = {
      mfaVerified: true,
      tokens: { accessToken: "activity-fixture", expiresIn: 900 },
      user: { id: "owner", fullName: "Motion Owner", email: "owner@example.test", locale: v.locale, isVerified: true },
      workspace: { id: "workspace", name: "Fixture business" },
      roles: ["OWNER"]
    };
    const turn: WorkspaceAssistantTurn = {
      id: "11111111-1111-4111-8111-111111111111",
      message: "Plan my event campaign",
      createdAt: new Date().toISOString(),
      status: "THINKING",
      reply: "",
      proposal: null
    };
    const campaign = {
      id: "job",
      requestId: turn.id,
      objective: "Event campaign",
      status: "RUNNING" as const,
      campaignId: null,
      errorCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: { completedWeeks: 1, totalWeeks: 5 },
      canResume: false
    };
    let resumes = 0;
    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
      roles: session.roles,
      user: session.user,
      workspace: session.workspace
    });
    await page.route("**/v1/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (p === "/v1/auth/refresh") data = session;
      else if (p === "/v1/onboarding") data = { status: "COMPLETE", businessProfile: { status: "APPROVED" } };
      else if (p === "/v1/assistant/conversation") data = [turn];
      else if (p.endsWith("/resume")) {
        resumes++;
        turn.status = "EXECUTING";
        turn.campaign = { ...campaign, status: "QUEUED" };
        data = turn.campaign;
      } else if (p === "/v1/campaigns/summaries") data = { items: [], nextCursor: null };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    });
    try {
      await page.goto(`${base}/${v.locale}/app`, { waitUntil: "domcontentloaded" });
      await page.locator(".markos-task").waitFor();
      expect(await page.locator(".lucide-sparkles,.lucide-wand-sparkles").count()).toBe(0);
      expect(await page.getByRole("progressbar").count()).toBe(0);
      expect(
        await page
          .locator(".markos-pulse i")
          .first()
          .evaluate((n) => getComputedStyle(n).animationName)
      ).toBe(v.reduced ? "none" : "markos-ink");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `../../var/ui-motion-2026-11-15/screens/thinking-${v.locale}-${v.theme}.png` });
      turn.status = "EXECUTING";
      turn.campaign = campaign;
      await expect.poll(() => page.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
      expect(await page.getByRole("progressbar").getAttribute("aria-valuemax")).toBe("5");
      expect(await page.getByRole("link", { name: v.locale === "ar" ? "فتح الحملة ←" : "Open campaign →", exact: true }).count()).toBe(0);
      await page.getByLabel(v.locale === "ar" ? "راسل ماركوس" : "Message MARKOS", { exact: true }).fill("Another idea");
      expect(await page.getByRole("button", { name: v.locale === "ar" ? "إرسال الرسالة" : "Send message", exact: true }).isEnabled()).toBe(true);
      turn.status = "FAILED";
      turn.campaign = { ...campaign, status: "FAILED", canResume: true };
      const retry = page.getByRole("button", { name: v.locale === "ar" ? "إعادة محاولة العمل المتبقي" : "Retry remaining work", exact: true });
      await retry.waitFor();
      await retry.click();
      await expect.poll(() => resumes).toBe(1);
      await page.getByRole("progressbar").waitFor();
      turn.status = "COMPLETED";
      turn.campaignId = "22222222-2222-4222-8222-222222222222";
      turn.campaign = { ...campaign, status: "COMPLETED", campaignId: turn.campaignId, progress: { completedWeeks: 5, totalWeeks: 5 } };
      const open = page.getByRole("link", { name: v.locale === "ar" ? "فتح الحملة ←" : "Open campaign →", exact: true });
      await open.waitFor();
      expect(await open.getAttribute("href")).toBe(`/${v.locale}/app/campaigns?campaign=${turn.campaignId}`);
      expect(await page.getByRole("progressbar").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: `../../var/ui-motion-2026-11-15/screens/ready-${v.locale}-${v.theme}.png` });
    } finally {
      await context.close();
    }
  },
  60000
);
