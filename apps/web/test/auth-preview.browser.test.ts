import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.DESIGN_PREVIEW_BASE_URL ?? process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("DESIGN_PREVIEW_BASE_URL or SETTINGS_BROWSER_BASE_URL is required for rendered auth-preview tests");

const screenshotDir = process.env.DESIGN_PREVIEW_SCREENSHOT_DIR;
let browser: Browser;

describe("rendered Sunlit authentication preview", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });

    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("completes the English signup preview and preserves explicit consent", async () => {
    const context = await browser.newContext({ viewport: { height: 1000, width: 1440 } });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/en/design-preview/signup`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Create your account" }).waitFor();

    await expect(page.locator('[data-auth-preview="signup"]').getAttribute("dir")).resolves.toBe("ltr");
    await expect(page.locator('[data-auth-preview="signup"]').evaluate((element) => getComputedStyle(element).colorScheme)).resolves.toBe("light");
    const googleButton = page.getByRole("button", { name: "Continue with Google" });
    const appleButton = page.getByRole("button", { name: "Continue with Apple" });
    await expect(googleButton.isVisible()).resolves.toBe(true);
    await expect(appleButton.isVisible()).resolves.toBe(true);
    const [googleButtonHeight, appleButtonHeight] = await Promise.all([
      googleButton.evaluate((element) => element.getBoundingClientRect().height),
      appleButton.evaluate((element) => element.getBoundingClientRect().height)
    ]);
    expect(appleButtonHeight).toBe(googleButtonHeight);
    await expect(
      page.locator('img[src="/design-preview/providers/google-signin.svg"]').evaluate((image) => (image as HTMLImageElement).naturalWidth)
    ).resolves.toBeGreaterThan(0);
    await expect(
      page.locator('img[src="/design-preview/providers/apple-signin.png"]').evaluate((image) => (image as HTMLImageElement).naturalWidth)
    ).resolves.toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Terms of Service" }).first().getAttribute("href")).resolves.toBe("/en/design-preview/terms");
    await saveScreenshot(page, "auth-signup-en-desktop");

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.locator('[data-tone="error"][role="alert"]').textContent()).resolves.toContain("Agree to the Terms of Service");

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("status").textContent()).resolves.toContain("final system");

    await page.getByLabel("Full name").fill("Mariam Ali");
    await page.getByLabel("Email").fill("mariam@example.com");
    await page.locator('input[autocomplete="new-password"]').fill("a-secure-passphrase");

    const devtools = await context.newCDPSession(page);
    await devtools.send("DOM.enable");
    await devtools.send("CSS.enable");
    const documentNode = await devtools.send("DOM.getDocument");
    const emailNode = await devtools.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: "#email" });
    await devtools.send("CSS.forcePseudoState", { forcedPseudoClasses: ["autofill"], nodeId: emailNode.nodeId });
    const autofillStyle = await page.locator("#email").evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, textFill: style.webkitTextFillColor };
    });
    expect(autofillStyle.textFill).toBe("rgb(32, 33, 43)");
    expect(autofillStyle.boxShadow).toContain("rgb(255, 255, 255)");
    await saveScreenshot(page, "auth-signup-en-filled-desktop");
    await devtools.send("CSS.forcePseudoState", { forcedPseudoClasses: [], nodeId: emailNode.nodeId });
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/en\/design-preview\/verify\?email=mariam%40example\.com$/);
    await page.getByRole("heading", { level: 1, name: "Check your email" }).waitFor();

    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await saveScreenshot(page, "auth-verify-en-desktop");
    await context.close();
  }, 90_000);

  it("renders an RTL mobile signup without losing its supporting text", async () => {
    const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/ar/design-preview/signup`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "أنشئ حسابك" }).waitFor();

    await expect(page.locator('[data-auth-preview="signup"]').getAttribute("dir")).resolves.toBe("rtl");
    await expect(page.getByText("أضف معلومات عملك بعد تجهيز الحساب.").isVisible()).resolves.toBe(true);
    await expect(page.getByText("12 حرفًا على الأقل").isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "المتابعة باستخدام Apple" }).isVisible()).resolves.toBe(true);
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);

    await saveScreenshot(page, "auth-signup-ar-mobile");
    await context.close();
  });

  it("covers neutral recovery, reset states, verification, and draft legal pages", async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/en/design-preview/login`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByRole("heading", { level: 1, name: "Reset your password" }).waitFor();
    await page.getByLabel("Email").fill("account@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByRole("heading", { level: 1, name: "Check your email" }).waitFor();
    await expect(page.getByText("If an account exists for this address, a password reset link will be sent.").isVisible()).resolves.toBe(true);

    await page.goto(`${baseUrl}/en/design-preview/reset-password`, { waitUntil: "networkidle" });
    const resetPasswordFields = page.locator('input[autocomplete="new-password"]');
    await resetPasswordFields.nth(0).fill("first-passphrase");
    await resetPasswordFields.nth(1).fill("second-passphrase");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.locator('[data-tone="error"][role="alert"]').textContent()).resolves.toContain("do not match");
    await resetPasswordFields.nth(1).fill("first-passphrase");
    await page.getByRole("button", { name: "Update password" }).click();
    await page.getByRole("heading", { level: 1, name: "Password updated" }).waitFor();

    await page.goto(`${baseUrl}/ar/design-preview/verify?email=owner%40example.com`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "تحقق من بريدك الإلكتروني" }).waitFor();
    await expect(page.getByText("owner@example.com").isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: /إعادة الإرسال خلال/ }).isDisabled()).resolves.toBe(true);

    await page.goto(`${baseUrl}/en/design-preview/terms`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "The terms for using MARKOS" }).waitFor();
    await expect(page.getByText("Working draft", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Powered by Ra'edat Software L.L.C.").isVisible()).resolves.toBe(true);

    await page.goto(`${baseUrl}/ar/design-preview/privacy`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "كيفية التعامل مع المعلومات في MARKOS" }).waitFor();
    await expect(page.locator('[data-legal-preview="privacy"]').getAttribute("dir")).resolves.toBe("rtl");
    await expect(page.getByText("مسودة عمل", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);

    await saveScreenshot(page, "legal-privacy-ar-desktop");
    await context.close();
  }, 90_000);
});

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function saveScreenshot(page: Page, name: string) {
  if (!screenshotDir) return;
  await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
}
