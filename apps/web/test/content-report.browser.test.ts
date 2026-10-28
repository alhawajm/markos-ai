import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
const baseUrl = process.env.CONTENT_REPORT_BROWSER_BASE_URL ?? process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("CONTENT_REPORT_BROWSER_BASE_URL is required");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  mkdirSync("evidence", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});
it.each(["en", "ar"])("reports AI output from Settings in %s with retry and focus recovery", async (locale) => {
  const context = await browser.newContext({ viewport: { width: locale === "en" ? 1440 : 390, height: 900 } });
  try {
    const page = await context.newPage();
    const ar = locale === "ar";
    const session = {
      roles: ["OWNER"],
      tokens: { accessToken: "report-browser-test", expiresIn: 900 },
      user: { id: "user-1", fullName: "Test Owner", email: "owner@markos.test", locale, isVerified: true },
      workspace: { id: "workspace-1", name: "Test workspace" }
    };
    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
      roles: session.roles,
      user: session.user,
      workspace: session.workspace
    });
    const reports: Record<string, unknown>[] = [];
    const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    await page.route("**/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/v1/auth/refresh") return route.fulfill(json(session));
      if (path === "/v1/account")
        return route.fulfill(
          json({
            user: { ...session.user, updatedAt: new Date().toISOString(), mfaEnabled: false },
            workspace: { ...session.workspace, ownerUserId: session.user.id, updatedAt: new Date().toISOString() }
          })
        );
      if (path === "/v1/onboarding") return route.fulfill(json({ status: "COMPLETE", businessProfile: { status: "APPROVED" } }));
      if (path === "/v1/auth/mfa/totp") return route.fulfill(json({ enabled: false }));
      if (path === "/v1/workspace/instagram") return route.fulfill(json({ connected: false, status: "DISCONNECTED", recentMedia: [] }));
      if (path === "/v1/billing/summary") return route.fulfill(json({ invoices: [], payments: [] }));
      if (path === "/v1/content-reports") {
        reports.push(route.request().postDataJSON());
        if (reports.length === 1)
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Retry" } }) });
        return route.fulfill(json({ id: "report-receipt", status: "OPEN", createdAt: new Date().toISOString() }));
      }
      return route.fulfill(json([]));
    });
    await page.goto(`${baseUrl}/${locale}/app/settings#profile`, { waitUntil: "domcontentloaded" });
    const opener = page.getByRole("button", { name: ar ? "الإبلاغ عن محتوى الذكاء الاصطناعي" : "Report AI content", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    expect(await dialog.getAttribute("dir")).toBe(ar ? "rtl" : "ltr");
    const send = dialog.getByRole("button", { name: ar ? "إرسال البلاغ" : "Send report", exact: true });
    expect(await send.isDisabled()).toBe(true);
    const note = dialog.getByLabel(ar ? "ماذا حدث؟" : "What happened?");
    await note.fill(ar ? "هذا المحتوى غير مناسب. يرجى مراجعته." : "This content is inappropriate. Please review it.");
    await page.screenshot({ path: `evidence/content-report-${locale}.png`, fullPage: true });
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await send.click();
    await dialog.getByRole("alert").waitFor();
    expect(await note.inputValue()).toContain(ar ? "يرجى" : "Please");
    await send.click();
    await dialog.getByRole("status").waitFor();
    expect(reports).toHaveLength(2);
    expect(reports[0]).toEqual(reports[1]);
    expect(reports[1]).toMatchObject({ source: "GENERAL_AI", reason: "OFFENSIVE" });
    await dialog.getByRole("button", { name: ar ? "إغلاق" : "Close", exact: true }).click();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await context.close();
  }
});
