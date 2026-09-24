import { mkdir } from "node:fs/promises";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountPolicyVersion } from "@markos/validation";
import { assertPlexFonts } from "./browser-fonts";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
});
afterAll(async () => {
  await browser?.close();
});
describe("password recovery in the rendered browser", () => {
  it("records consent with web signup and reaches email verification", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    let registration: Record<string, unknown> | undefined;
    await page.route("**/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/register")) {
        registration = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              user: { id: "test-user", email: "owner@example.test", fullName: "Test Owner", locale: "en", isVerified: false },
              workspace: { id: "test-workspace", name: "Business", slug: "business" },
              roles: ["OWNER"],
              tokens: { accessToken: "test-access", expiresIn: 900 }
            }
          })
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { alreadyVerified: false, email: "owner@example.test", expiresAt: new Date(Date.now() + 600000).toISOString() } })
      });
    });
    await page.goto(`${baseUrl}/en/signup`, { waitUntil: "networkidle" });
    await page.getByLabel("Full name").fill("Test Owner");
    await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
    await page.locator('input[autocomplete="new-password"]').fill("A unique long passphrase 99!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.waitForURL(/\/en\/verify\?/);
    expect(registration).toMatchObject({ acceptedTerms: true, policyVersion: accountPolicyVersion, email: "owner@example.test" });
    await context.close();
  }, 90000);
  it.each(["en", "ar"])(
    "handles errors, matching passwords and success without storing secrets (%s)",
    async (locale) => {
      const context = await browser.newContext({ viewport: locale === "ar" ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const errors: string[] = [];
      const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const challengeId = "e4a2ac69-14be-4e9c-9da8-456407c653dc";
      await page.route("**/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const body = route.request().postDataJSON();
        calls.push({ path, body });
        const payload = path.endsWith("/forgot")
          ? { data: { challengeId, expiresAt: new Date(Date.now() + 600000).toISOString() } }
          : body.code === "01234567"
            ? { data: { reset: true } }
            : { error: { code: "PASSWORD_RESET_INVALID", message: "Invalid code" } };
        await route.fulfill({
          contentType: "application/json",
          status: path.endsWith("/forgot") ? 202 : body.code === "01234567" ? 200 : 400,
          body: JSON.stringify(payload)
        });
      });
      await page.goto(`${baseUrl}/${locale}/forgot-password`, { waitUntil: "networkidle" });
      await page.locator("#recovery-email").fill("owner@example.test");
      await page.locator('button[type="submit"]').click();
      await page.locator("#recovery-code").waitFor();
      await page.locator("#recovery-code").fill("12345678");
      await page.locator("#recovery-password").fill("A unique long passphrase 99!");
      await page.locator("#recovery-confirm").fill("A different long passphrase!");
      await page.locator('button[type="submit"]').click();
      await page.locator('form [role="alert"]').waitFor();
      expect(calls.filter((call) => call.path.endsWith("/reset"))).toHaveLength(0);
      await page.locator("#recovery-confirm").fill("A unique long passphrase 99!");
      await page.locator('button[type="submit"]').click();
      await page
        .getByRole("alert")
        .filter({ hasText: locale === "ar" ? "غير صحيح" : "invalid" })
        .waitFor();
      expect(await page.locator("#recovery-password").inputValue()).toBe("A unique long passphrase 99!");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('[data-auth-page="forgot-password"]').getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
      await assertPlexFonts(page, ["h1", "label[for='recovery-password']"]);
      if (process.env.MARKOS_UI_SCREENSHOT_DIR) {
        await mkdir(process.env.MARKOS_UI_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.MARKOS_UI_SCREENSHOT_DIR}/recovery-${locale}.png`, fullPage: true });
      }
      await page.locator("#recovery-code").fill(locale === "ar" ? "٠١٢٣٤٥٦٧" : "01234567");
      await page.locator('button[type="submit"]').click();
      await page.getByRole("heading", { level: 1, name: locale === "ar" ? "تم تحديث كلمة المرور" : "Password updated" }).waitFor();
      expect(calls.at(-1)?.body).toMatchObject({ challengeId, code: "01234567", password: "A unique long passphrase 99!" });
      expect(await page.locator("#recovery-password").count()).toBe(0);
      const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      expect(storage).not.toContain("passphrase");
      expect(storage).not.toContain("01234567");
      expect(page.url()).not.toContain(challengeId);
      expect(errors).toEqual([]);
      await context.close();
    },
    60000
  );
});
