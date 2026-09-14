import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InstagramLearningRecord } from "@markos/shared-types";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
let browser: Browser;
const json = (data: unknown) => ({ contentType: "application/json", body: JSON.stringify({ data }) });
const session = {
  user: { id: "learning-owner", isVerified: true, email: "owner@example.test", locale: "en", fullName: "Owner" },
  workspace: { id: "learning-workspace", name: "Test studio" },
  roles: ["OWNER"],
  tokens: { accessToken: "test-only", expiresIn: 900 },
  mfaVerified: false,
  mfaVerifiedUntil: null
};
const root = "/v1/workspace/instagram/learning";
const proposal: InstagramLearningRecord = {
  id: "learning-run",
  status: "READY",
  expectedVersion: 3,
  current: { toneWords: ["Clear"], voiceNotes: "Owner preference", aestheticWords: [], contentDirection: "Current direction" },
  evidence: {
    accountId: "test-account",
    username: "test_business",
    profile: {},
    discovered: 12,
    historyComplete: false,
    metricsCovered: 12,
    warnings: [],
    posts: [{ id: "post-1", caption: "A useful guide", mediaType: "IMAGE", timestamp: "2026-09-01T00:00:00Z", metrics: { likes: 0 }, selection: "LATEST" }]
  },
  result: {
    summary: "The sampled posts use concise bilingual captions.",
    limitations: ["Cover images do not show complete videos."],
    suggestions: [
      { field: "voiceNotes", value: "Arabic then English", reasoning: "Both languages appear in the sampled captions.", sourcePostIds: ["post-1"] },
      { field: "contentDirection", value: "Share practical guides", reasoning: "Guides appear in the sample.", sourcePostIds: ["post-1"] }
    ]
  }
};

describe("guided Instagram connection and learning", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
    });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("enrolls MFA inline without step-up and prevents duplicate OAuth requests", async () => {
    const calls: string[] = [];
    let pending: Route | undefined;
    const page = await setupPage(false, false, async (route, path) => {
      calls.push(path);
      if (path === "/v1/auth/mfa/totp/setup")
        return route.fulfill(json({ secret: "TESTSETUPKEY", otpauthUri: "otpauth://totp/Markos:test?secret=TESTSETUPKEY&issuer=Markos" }));
      if (path === "/v1/auth/mfa/totp/enable") {
        expect(route.request().postDataJSON()).toEqual({ code: "123456" });
        return route.fulfill(json({ enabled: true }));
      }
      if (path.endsWith("/oauth/start")) {
        pending = route;
        return;
      }
      return route.fulfill({ status: 404, body: "{}" });
    });
    await page.goto(`${baseUrl}/en/instagram-setup`);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await page.getByLabel("Authenticator code", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await page.getByRole("heading", { name: "Connect your professional Instagram account" }).waitFor();
    const button = page.getByRole("button", { name: "Connect Instagram", exact: true });
    await button.click();
    await expect.poll(() => Boolean(pending)).toBe(true);
    await expect(button.isDisabled()).resolves.toBe(true);
    await button.click({ force: true });
    expect(calls.filter((path) => path.endsWith("/oauth/start"))).toHaveLength(1);
    expect(pending!.request().postDataJSON()).toEqual({ locale: "en", returnTo: "/en/instagram-setup" });
    await pending!.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Please retry connection." } }) });
    await page.getByRole("alert").getByText("Please retry connection.").waitFor();
    expect(calls).not.toContain("/v1/auth/mfa/totp/verify");
    expect(await page.getByRole("link", { name: "Do this later" }).getAttribute("href")).toBe("/en/app");
    await page.context().close();
  });

  it("preserves edited proposals through late progress and failed saves, then applies only selected fields", async () => {
    let analysis: Route | undefined;
    let latePoll: Route | undefined;
    let approvalCount = 0;
    let payload: unknown;
    const page = await setupPage(true, true, async (route, path) => {
      if (path === root && route.request().method() === "POST") return route.fulfill(json({ ...proposal, result: undefined, status: "PENDING" }));
      if (path === root) {
        latePoll = route;
        return;
      }
      if (path.endsWith("/analyze")) {
        analysis = route;
        return;
      }
      if (path.endsWith("/approve")) {
        approvalCount++;
        payload = route.request().postDataJSON();
        if (approvalCount === 1)
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Save failed. Try again." } }) });
        return route.fulfill(json({ ...proposal, status: "APPROVED" }));
      }
      return route.fulfill({ status: 404, body: "{}" });
    });
    await page.goto(`${baseUrl}/en/instagram-setup`);
    await expect.poll(() => Boolean(analysis && latePoll), { timeout: 10000 }).toBe(true);
    await analysis!.fulfill(json(proposal));
    await page.getByRole("heading", { name: "Review what MARKOS learned" }).waitFor();
    const section = page.getByRole("heading", { name: "Brand & Voice" }).locator("..");
    await section.getByRole("button", { name: "Edit", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Writing preferences" });
    await input.fill("  Owner-reviewed العربية\nEnglish below.  ");
    await page.getByRole("checkbox", { name: "Content direction", exact: true }).uncheck();
    await latePoll!.fulfill(json(proposal));
    await page.getByRole("button", { name: "Use selected changes" }).click();
    await page.getByRole("alert").getByText("Save failed. Try again.").waitFor();
    expect(await input.inputValue()).toBe("  Owner-reviewed العربية\nEnglish below.  ");
    expect(payload).toEqual({ expectedVersion: 3, changes: [{ field: "voiceNotes", value: "  Owner-reviewed العربية\nEnglish below.  " }] });
    await page.getByRole("button", { name: "Use selected changes" }).click();
    await page.getByRole("heading", { name: "Setup complete" }).waitFor();
    expect(await page.getByRole("link", { name: "View Business profile" }).getAttribute("href")).toBe("/en/app/knowledge");
    await page.context().close();
  });

  it("supports Arabic dark review and keeping the existing profile without mutations", async () => {
    const calls: string[] = [];
    const page = await setupPage(
      true,
      true,
      async (route, path) => {
        calls.push(path);
        return route.fulfill(json({ ...proposal, status: path.endsWith("/skip") ? "SKIPPED" : "READY" }));
      },
      true
    );
    await page.goto(`${baseUrl}/ar/instagram-setup`);
    await page.getByRole("heading", { name: "راجع ما تعلمه ماركوس" }).waitFor();
    expect(await page.locator("main").getAttribute("dir")).toBe("rtl");
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole("button", { name: "الاحتفاظ بالملف الحالي والمتابعة" }).click();
    await page.getByRole("heading", { name: "اكتمل الإعداد" }).waitFor();
    expect(calls.some((path) => path.endsWith("/approve"))).toBe(false);
    expect(calls.some((path) => path.endsWith("/analyze"))).toBe(false);
    await page.context().close();
  });
});

async function setupPage(enabled: boolean, connected: boolean, handler: (route: Route, path: string) => Promise<unknown>, dark = false): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: dark ? "dark" : "light" });
  const page = await context.newPage();
  await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/refresh") return route.fulfill(json(session));
    if (path === "/v1/onboarding") return route.fulfill(json({ status: "COMPLETE", businessProfile: { status: "APPROVED" } }));
    if (path === "/v1/auth/mfa/totp") return route.fulfill(json({ enabled }));
    if (path === "/v1/workspace/instagram")
      return route.fulfill(json({ connected, status: connected ? "CONNECTED" : "DISCONNECTED", username: "test_business", recentMedia: [] }));
    await handler(route, path);
  });
  return page;
}
