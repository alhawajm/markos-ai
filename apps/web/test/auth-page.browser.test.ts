import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered authentication tests");

const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;
let browser: Browser;

const unverifiedSession = authSession(false);
const verifiedSession = authSession(true);

describe("rendered Sunlit authentication", () => {
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

  it("registers, requests verification, verifies the token, and resumes onboarding", async () => {
    const context = await browser.newContext({ viewport: { height: 1000, width: 1440 } });
    const page = await context.newPage();
    const requests: Array<{ body: unknown; path: string }> = [];

    await mockApi(page, async (route, pathname) => {
      requests.push({ body: route.request().postDataJSON(), path: pathname });

      if (pathname === "/v1/auth/register") return route.fulfill(json(unverifiedSession, 201));
      if (pathname === "/v1/auth/verification/request") {
        return route.fulfill(
          json({
            alreadyVerified: false,
            email: unverifiedSession.user.email,
            expiresAt: "2026-08-12T11:00:00.000Z",
            verificationToken: "local-verification-token-1234567890"
          })
        );
      }
      if (pathname === "/v1/auth/verify-email") {
        return route.fulfill(json({ email: verifiedSession.user.email, isVerified: true }));
      }
      if (pathname === "/v1/auth/refresh") return route.fulfill(json(verifiedSession));
      if (pathname === "/v1/onboarding") {
        return route.fulfill(json({ businessProfile: { status: "NOT_GENERATED" }, status: "NOT_STARTED" }));
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/signup`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Create your account" }).waitFor();

    await expect(page.locator('[data-auth-page="signup"]').getAttribute("dir")).resolves.toBe("ltr");
    await expect(page.locator('[data-auth-page="signup"]').evaluate((element) => getComputedStyle(element).colorScheme)).resolves.toBe("light");
    await expect(page.getByRole("link", { name: "Terms of Service" }).first().getAttribute("href")).resolves.toBe("/en/terms");
    await expect(
      page.locator('img[src="/auth/providers/google-signin.svg"]').evaluate((image) => (image as HTMLImageElement).naturalWidth)
    ).resolves.toBeGreaterThan(0);
    await expect(
      page.locator('img[src="/auth/providers/apple-signin.png"]').evaluate((image) => (image as HTMLImageElement).naturalWidth)
    ).resolves.toBeGreaterThan(0);

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.locator('[data-tone="error"][role="alert"]').textContent()).resolves.toContain("Agree to the Terms of Service");

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByRole("status").textContent()).resolves.toContain("not available yet");

    await page.getByLabel("Full name").fill("Mariam Ali");
    await page.getByLabel("Email").fill(unverifiedSession.user.email);
    await page.locator('input[autocomplete="new-password"]').fill("a-secure-passphrase");
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL(/\/en\/verify\?email=mariam%40example\.com$/);
    await page.getByRole("heading", { level: 1, name: "Check your email" }).waitFor();
    await page.getByRole("button", { name: "Verify locally and continue" }).click();
    await page.waitForURL(/\/en\/onboarding$/);

    expect(requests.find((request) => request.path === "/v1/auth/register")?.body).toEqual({
      email: "mariam@example.com",
      fullName: "Mariam Ali",
      locale: "en",
      password: "a-secure-passphrase"
    });
    expect(requests.find((request) => request.path === "/v1/auth/verification/request")?.body).toEqual({ email: "mariam@example.com", locale: "en" });
    expect(requests.find((request) => request.path === "/v1/auth/verify-email")?.body).toEqual({ token: "local-verification-token-1234567890" });
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await saveScreenshot(page, "auth-onboarding-en-desktop");
    await context.close();
  }, 90_000);

  it("logs a verified user into the canonical app route", async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    let loginBody: unknown;

    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/auth/login") {
        loginBody = route.request().postDataJSON();
        return route.fulfill(json(verifiedSession));
      }
      if (pathname === "/v1/auth/refresh") return route.fulfill(json(verifiedSession));
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/login`, { waitUntil: "networkidle" });
    await expect(page.locator('[data-login-preview="week"]').isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Open Wednesday 26 August" }).click();
    await expect(page.locator('[data-login-preview="day"]').isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Open Product spotlight" }).click();
    await expect(page.locator('[data-login-preview="post"]').isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Wednesday" }).click();
    await page.getByRole("button", { name: "Week overview" }).click();
    await expect(page.locator('[data-login-preview="week"]').isVisible()).resolves.toBe(true);
    await page.getByLabel("Email").fill(verifiedSession.user.email);
    await page.locator('input[autocomplete="current-password"]').fill("a-secure-passphrase");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/en\/app$/);

    expect(loginBody).toEqual({ email: "mariam@example.com", password: "a-secure-passphrase" });
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await context.close();
  });

  it("reveals the optional MFA step only after the API requests it", async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    const loginBodies: unknown[] = [];

    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/auth/login") {
        const body = route.request().postDataJSON();
        loginBodies.push(body);
        if (!(body as { totpCode?: string }).totpCode) {
          return route.fulfill({
            body: JSON.stringify({ error: { code: "MFA_REQUIRED", message: "MFA is required" } }),
            contentType: "application/json",
            status: 401
          });
        }
        return route.fulfill(json(verifiedSession));
      }
      if (pathname === "/v1/auth/refresh") return route.fulfill(json(verifiedSession));
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(verifiedSession.user.email);
    await page.locator('input[autocomplete="current-password"]').fill("a-secure-passphrase");
    await page.getByRole("button", { name: "Log in" }).click();

    const mfaCode = page.getByLabel("MFA code");
    const mfaStatus = page.getByRole("status");
    await mfaCode.waitFor();
    await mfaStatus.getByText(/6-digit code/).waitFor();
    await mfaCode.fill("123456");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/en\/app$/);

    expect(loginBodies).toEqual([
      { email: "mariam@example.com", password: "a-secure-passphrase" },
      { email: "mariam@example.com", password: "a-secure-passphrase", totpCode: "123456" }
    ]);
    await context.close();
  });

  it("keeps recovery limitations honest and renders canonical legal pages", async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/en/login`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill("account@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status").textContent()).resolves.toContain("not connected yet");

    await page.goto(`${baseUrl}/en/terms`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "The terms for using MARKOS" }).waitFor();
    await expect(page.getByText("Powered by Ra'edat Software L.L.C.").isVisible()).resolves.toBe(true);

    await page.goto(`${baseUrl}/ar/privacy`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "كيفية التعامل مع المعلومات في MARKOS" }).waitFor();
    await expect(page.locator('[data-legal-document="privacy"]').getAttribute("dir")).resolves.toBe("rtl");
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await context.close();
  });
});

async function mockApi(page: Page, handler: (route: Route, pathname: string) => Promise<unknown>) {
  await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
    await handler(route, new URL(route.request().url()).pathname);
  });
}

function authSession(isVerified: boolean) {
  return {
    mfaVerified: true,
    mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
    roles: ["OWNER"],
    tokens: { accessToken: isVerified ? "verified-access-token" : "unverified-access-token", expiresIn: 900 },
    user: { email: "mariam@example.com", fullName: "Mariam Ali", id: "user-mariam", isVerified, locale: "en" },
    workspace: { id: "workspace-mariam", name: "Mariam's Workspace", slug: "mariam-workspace" }
  };
}

function json(data: unknown, status = 200) {
  return { body: JSON.stringify({ data }), contentType: "application/json", status };
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function saveScreenshot(page: Page, name: string) {
  if (!screenshotDir) return;
  await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
}
