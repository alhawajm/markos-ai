import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered Settings tests");
let browser: Browser;
const session = {
  mfaVerified: true,
  mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
  tokens: {
    accessToken: "browser-session-token",
    expiresIn: 900
  },
  user: {
    id: "user-1",
    email: "owner@markos.test",
    fullName: "Browser Owner",
    locale: "en",
    isVerified: true
  },
  workspace: { id: "workspace-1", name: "Browser Workspace" },
  roles: ["OWNER"]
};
const storedIdentity = {
  roles: session.roles,
  user: session.user,
  workspace: session.workspace
};
const disconnected = {
  connected: false,
  status: "DISCONNECTED",
  recentMedia: []
};
const connected = {
  connected: true,
  status: "CONNECTED",
  accountId: "17841400000000001",
  username: "markos_business",
  tokenExpiresAt: "2026-09-30T12:00:00.000Z",
  lastSyncedAt: "2026-07-29T12:00:00.000Z",
  recentMedia: [
    {
      id: "image-1",
      mediaType: "IMAGE",
      caption: "Bahrain launch",
      mediaUrl: "https://media.markos.test/image.png",
      permalink: "https://instagram.test/p/image-1"
    },
    { id: "video-1", mediaType: "VIDEO" }
  ]
};

describe("active SettingsPanel Instagram interactions", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });
    mkdirSync("evidence", { recursive: true });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("is the active route, renders a truthful disconnected state, and prevents duplicate connect requests", async () => {
    const { page, requests } = await settingsPage(disconnected);
    await expect(page.getByRole("heading", { name: "Settings", exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.locator(".bg-card, .bg-canvas, .text-navy").count()).resolves.toBe(0);
    await expect(page.getByText("No account connected", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Dry run", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Zain Arabia").count()).resolves.toBe(0);
    await expect(page.getByRole("button", { name: "Refresh token" }).isDisabled()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "Disconnect" }).isDisabled()).resolves.toBe(true);
    const connect = page.getByRole("button", { name: "Connect OAuth" });
    let pending: Route | undefined;
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/oauth\/start$/, async (route) => {
      requests.push(route.request().url());
      expect(route.request().postDataJSON()).toEqual({
        locale: "en",
        returnTo: "/en/app/settings"
      });
      pending = route;
    });
    await connect.press("Enter");
    await expect(connect.isDisabled()).resolves.toBe(true);
    await connect.click({ force: true });
    expect(requests.filter((url) => url.endsWith("/oauth/start"))).toHaveLength(1);
    await pending!.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Instagram connection is temporarily unavailable." }
      })
    });
    const alert = page.locator('[data-notification-toast][role="alert"]');
    await alert.getByText("Instagram connection is temporarily unavailable.").waitFor();
    await expect(alert.getByText("Instagram connection is temporarily unavailable.").isVisible()).resolves.toBe(true);
    await expect(alert.getAttribute("class")).resolves.toContain("fixed");
    await page.screenshot({
      path: "evidence/settings-instagram-disconnected.png",
      fullPage: true
    });
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.locator('[data-notification-toast][role="alert"]').count()).resolves.toBe(0);
    await page.close();
  });

  it("logs out from profile settings", async () => {
    const { page, requests } = await settingsPage(disconnected, "/en/app/settings#profile");
    const logout = page.getByRole("button", { name: "Log out", exact: true });
    await logout.waitFor();

    await Promise.all([page.waitForURL(`${baseUrl}/en/login`), logout.click()]);

    expect(requests.filter((url) => url.endsWith("/v1/auth/logout"))).toHaveLength(1);
    await expect(page.evaluate(() => localStorage.getItem("markos.session"))).resolves.toBeNull();
    await page.close();
  });

  it("keeps the Sunlit Settings surface usable in Arabic RTL on mobile", async () => {
    const { page } = await settingsPage(disconnected, "/ar/app/settings#connections");
    await page.setViewportSize({ height: 844, width: 390 });

    await expect(page.locator('[lang="ar"][dir="rtl"]').count()).resolves.toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "الإعدادات", exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.locator(".bg-card, .bg-canvas, .text-navy").count()).resolves.toBe(0);
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    await page.close();
  });

  it("resets the fixture onboarding draft and exposes honest Story and Products steps", async () => {
    const page = await browserPage();
    await page.addInitScript(
      ({ identity }) => {
        localStorage.setItem("markos.session", JSON.stringify(identity));
        localStorage.setItem(
          "markos.onboarding.draft",
          JSON.stringify({
            companyName: "Zain Arabia",
            competitors: ["Batelco"],
            industry: "Technology"
          })
        );
      },
      { identity: storedIdentity }
    );
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/v1/auth/refresh") return route.fulfill(json(session));
      if (pathname === "/v1/onboarding") return route.fulfill(json({ status: "NOT_STARTED", businessProfile: { status: "NOT_GENERATED" } }));
      return route.fulfill({ status: 404, body: "{}" });
    });

    await page.goto(`${baseUrl}/en/onboarding`, {
      waitUntil: "domcontentloaded"
    });
    await page.getByRole("heading", { name: "Tell us about your company" }).waitFor();
    await expect.poll(() => page.getByLabel("Company Name *").inputValue()).toBe("Browser Workspace");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Zain Arabia|Batelco|STC Bahrain|@zain_bh/i);
    const stored = await page.evaluate(() => ({
      legacy: localStorage.getItem("markos.onboarding.draft"),
      next: localStorage.getItem("markos.onboarding.draft.v2")
    }));
    expect(stored.legacy).toBeNull();
    expect(JSON.parse(stored.next ?? "{}")).toMatchObject({
      companyName: "Browser Workspace",
      competitors: [],
      products: []
    });

    await page.getByRole("button", { name: /Business Story/ }).click();
    await page.getByRole("heading", { name: "Tell your business story" }).waitFor();
    await expect(page.getByLabel("Business mission *").inputValue()).resolves.toBe("");

    await page.getByRole("button", { name: /Products & Services/ }).click();
    await page.getByRole("heading", { name: "What do you offer?" }).waitFor();
    await expect(page.getByText("No products or services added yet.").isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Continue" }).click();
    const alert = page.locator('[data-notification-toast][role="alert"]');
    await alert.getByText("Add at least one product or service.").waitFor();
    await expect(alert.getAttribute("class")).resolves.toContain("fixed");
    await page.screenshot({
      path: "evidence/onboarding-products-empty.png",
      fullPage: true
    });
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.locator('[data-notification-toast][role="alert"]').count()).resolves.toBe(0);

    await page.setViewportSize({ height: 844, width: 390 });
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    await page.screenshot({
      path: "evidence/onboarding-products-mobile.png",
      fullPage: true
    });
    await page.close();

    const arabic = await browserPage();
    await arabic.addInitScript((identity) => localStorage.setItem("markos.session", JSON.stringify(identity)), storedIdentity);
    await arabic.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/v1/auth/refresh") return route.fulfill(json(session));
      if (pathname === "/v1/onboarding") return route.fulfill(json({ status: "NOT_STARTED", businessProfile: { status: "NOT_GENERATED" } }));
      return route.fulfill({ status: 404, body: "{}" });
    });
    await arabic.goto(`${baseUrl}/ar/onboarding?step=2`, {
      waitUntil: "domcontentloaded"
    });
    await arabic.getByRole("heading", { name: "احكِ قصة نشاطك" }).waitFor();
    await arabic.setViewportSize({ height: 844, width: 390 });
    await expect(arabic.locator('[lang="ar"][dir="rtl"]').count()).resolves.toBeGreaterThan(0);
    const arabicWidths = await arabic.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    expect(arabicWidths.scroll).toBeLessThanOrEqual(arabicWidths.client);
    await arabic.close();
  });

  it("renders an editable bilingual resolved profile and approves the reviewed version", async () => {
    const page = await browserPage();
    const interactionId = "019fd833-4bf3-7ed5-9db9-6f96ab379054";
    let approvalPayload: Record<string, unknown> | undefined;
    const profile = browserBusinessProfile();
    const onboarding = {
      status: "IN_PROGRESS",
      onboardingScore: 100,
      vaultScore: {
        score: 100,
        completedSections: ["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"],
        missingSections: [],
        requiredSections: ["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"],
        entryCount: 8
      },
      modules: [],
      businessProfile: {
        status: "DRAFT",
        interactionId,
        profile,
        updatedAt: "2026-08-06T12:00:00.000Z"
      }
    };

    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), storedIdentity);
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/v1/auth/refresh") return route.fulfill(json(session));
      if (pathname === "/v1/onboarding" && request.method() === "GET") return route.fulfill(json(onboarding));
      if (pathname === "/v1/onboarding/profile/approve") {
        approvalPayload = request.postDataJSON() as Record<string, unknown>;
        return route.fulfill(
          json({
            ...onboarding,
            status: "COMPLETE",
            businessProfile: {
              ...onboarding.businessProfile,
              status: "APPROVED",
              profile: approvalPayload.profile as Record<string, unknown>
            }
          })
        );
      }
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/onboarding?step=8`, {
      waitUntil: "domcontentloaded"
    });
    await page.getByRole("heading", { name: "This is your business identity" }).waitFor();
    await expect(page.getByLabel("Business name").inputValue()).resolves.toBe("Pearl Coffee");
    await page.getByLabel("Short description").fill("Bahrain coffee, personally crafted.");
    await page.getByRole("button", { name: "العربية", exact: true }).click();
    await expect(page.getByLabel("Short description").inputValue()).resolves.toBe(profile.tagline.ar);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.screenshot({
      path: "evidence/onboarding-business-profile.png",
      fullPage: true
    });
    await page.setViewportSize({ height: 844, width: 390 });
    const profileWidths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    expect(profileWidths.scroll).toBeLessThanOrEqual(profileWidths.client);
    await page.screenshot({
      path: "evidence/onboarding-business-profile-mobile.png",
      fullPage: true
    });

    await Promise.all([page.waitForURL(/\/en\/app\/strategy$/), page.getByRole("button", { name: "Approve profile & continue" }).click()]);

    expect(approvalPayload).toMatchObject({
      interactionId,
      profile: {
        businessName: "Pearl Coffee",
        tagline: {
          en: "Bahrain coffee, personally crafted.",
          ar: profile.tagline.ar
        }
      }
    });
    await page.close();
  });

  it("processes callback results once, cleans sensitive query values, and renders sanitized mixed media", async () => {
    const { page } = await settingsPage(
      connected,
      "/en/app/settings?instagram=connected&code=provider-code&state=provider-state&tab=accounts&error_reason=none#connections"
    );
    await page.getByText("@markos_business").waitFor();
    await expect(page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await expect(page.getByRole("img", { name: "Bahrain launch" }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Latest post", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("VIDEO", { exact: true }).count()).resolves.toBe(0);
    await expect(page.getByText(/7\/29\/2026|29\/07\/2026/).count()).resolves.toBeGreaterThan(0);
    expect(page.url()).toBe(`${baseUrl}/en/app/settings?tab=accounts#connections`);
    const content = await page.locator("body").innerText();
    for (const secret of ["provider-code", "provider-state", "ciphertext", "access_token", "app_secret"]) expect(content).not.toContain(secret);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Instagram connection saved.").count()).resolves.toBe(0);

    const malformed = await settingsPage(connected, "/en/app/settings?instagram=unsupported&code=provider-code&state=provider-state&safe=retained#connections");
    await malformed.page.waitForURL(`${baseUrl}/en/app/settings?safe=retained#connections`);
    expect(malformed.page.url()).toBe(`${baseUrl}/en/app/settings?safe=retained#connections`);
    await expect(malformed.page.getByRole("status").count()).resolves.toBe(0);
    await malformed.page.close();
    await page.screenshot({
      path: "evidence/settings-instagram-connected.png",
      fullPage: true
    });
    await page.close();
  });

  it("renders empty and reauthorization states without claiming normal connection or revocation", async () => {
    const empty = await settingsPage({ ...connected, recentMedia: [] });
    await empty.page.getByText("@markos_business").waitFor();
    await expect(empty.page.getByText("Latest post", { exact: true }).count()).resolves.toBe(0);
    await expect(empty.page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await empty.page.close();

    const expired = await settingsPage({
      ...connected,
      connected: false,
      status: "REAUTHORIZE_REQUIRED"
    });
    await expired.page.getByText("reauthorize", { exact: true }).waitFor();
    await expect(expired.page.getByText("reauthorize", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(expired.page.getByText(/revoked/i).count()).resolves.toBe(0);
    await expect(expired.page.getByRole("button", { name: "Connect OAuth" }).isEnabled()).resolves.toBe(true);
    await expect(expired.page.getByRole("button", { name: "Refresh token" }).isDisabled()).resolves.toBe(true);
    await expired.page.close();
  });

  it("renders MFA enrollment as a local QR flow with a readable six-digit field", async () => {
    const { page, setMfaEnabled } = await settingsPage(disconnected, "/en/app/settings#security", false);
    const setup = {
      enabled: false,
      otpauthUri: "otpauth://totp/MARKOS-AI%3Aowner%40markos.test?secret=JBSWY3DPEHPK3PXP&issuer=MARKOS-AI",
      secret: "JBSWY3DPEHPK3PXP"
    };

    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/auth\/mfa\/totp\/setup$/, (route) => route.fulfill(json(setup)));
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/auth\/mfa\/totp\/enable$/, (route) => {
      expect(route.request().postDataJSON()).toEqual({ code: "123456" });
      setMfaEnabled(true);
      return route.fulfill(json({ enabled: true }));
    });
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/auth\/mfa\/totp\/verify$/, (route) => {
      expect(route.request().postDataJSON()).toEqual({ code: "123456" });
      return route.fulfill(json({ ...session, mfaVerified: true }));
    });

    const code = page.getByRole("textbox", { name: "Verification code" });
    await expect(code.count()).resolves.toBe(0);
    await page.getByRole("button", { name: "Set up MFA" }).click();
    await page
      .locator("svg title")
      .filter({
        hasText: "QR code for setting up MARKOS multi-factor authentication"
      })
      .waitFor({ state: "attached" });
    await expect(page.getByText("JBSWY3DPEHPK3PXP", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(code.isEnabled()).resolves.toBe(true);

    await code.fill("abc1234567");
    await expect(code.inputValue()).resolves.toBe("123456");
    const fieldColors = await code.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color
      };
    });
    expect(fieldColors.color).toBe("rgb(32, 33, 43)");
    expect(fieldColors.backgroundColor).toBe("rgb(255, 255, 255)");
    await page.screenshot({
      path: "evidence/settings-mfa-setup.png",
      fullPage: true
    });

    await page.setViewportSize({ height: 844, width: 390 });
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);

    await page.getByRole("button", { name: "Enable" }).click();
    await page.locator('[data-notification-toast][role="status"]').getByText("MFA enabled.").waitFor();
    await expect(page.getByText("JBSWY3DPEHPK3PXP", { exact: true }).count()).resolves.toBe(0);
    const mfaStatusRow = page.getByText("MFA", { exact: true }).locator("..");
    expect(await mfaStatusRow.innerText()).toContain("Verified for 15 minutes");
    await page.locator('[data-notification-toast][role="status"]').waitFor({ state: "detached", timeout: 8000 });
    await page.close();
  });

  it("refreshes once, updates only after confirmation, and preserves the connection on transient failure", async () => {
    const success = await settingsPage(connected);
    let pending: Route | undefined;
    let calls = 0;
    await success.page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/refresh$/, async (route) => {
      calls += 1;
      pending = route;
    });
    const refresh = success.page.getByRole("button", { name: "Refresh token" });
    await refresh.click();
    await expect(refresh.isDisabled()).resolves.toBe(true);
    await refresh.click({ force: true });
    expect(calls).toBe(1);
    await expect(success.page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await pending!.fulfill(
      json({
        refreshed: true,
        connection: { ...connected, username: "refreshed_business" }
      })
    );
    await success.page.getByText("@refreshed_business").waitFor();
    await expect(success.page.getByText("@refreshed_business").isVisible()).resolves.toBe(true);
    await success.page.close();

    const failure = await settingsPage(connected);
    await failure.page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/refresh$/, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Refresh is temporarily unavailable." }
        })
      })
    );
    await failure.page.getByRole("button", { name: "Refresh token" }).click();
    await failure.page.locator('[data-notification-toast][role="alert"]').getByText("Refresh is temporarily unavailable.").waitFor();
    await expect(failure.page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await expect(failure.page.locator('[data-notification-toast][role="alert"]').getByText("Refresh is temporarily unavailable.").isVisible()).resolves.toBe(
      true
    );
    await failure.page.close();
  });

  it("preserves connection on reconnect failure and cancellation", async () => {
    const { page } = await settingsPage(connected, "/en/app/settings?instagram=error&tab=accounts#connections");
    await page.getByText("@markos_business").waitFor();
    await expect(page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await expect(
      page.locator('[data-notification-toast][role="alert"]').getByText("Instagram authorization could not be completed. Try connecting again.").isVisible()
    ).resolves.toBe(true);
    expect(page.url()).toBe(`${baseUrl}/en/app/settings?tab=accounts#connections`);
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/oauth\/start$/, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Reconnect was not completed." }
        })
      })
    );
    await page.getByRole("button", { name: "Reconnect" }).click();
    await page.locator('[data-notification-toast][role="alert"]').getByText("Reconnect was not completed.").waitFor();
    await expect(page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await expect(page.locator('[data-notification-toast][role="alert"]').getByText("Reconnect was not completed.").isVisible()).resolves.toBe(true);
    await page.close();
  });

  it("requires disconnect confirmation, sends one request, and changes state only after backend success", async () => {
    const cancelled = await settingsPage(connected);
    let deleteCalls = 0;
    await cancelled.page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/, async (route) => {
      if (route.request().method() === "DELETE") deleteCalls += 1;
      await route.fallback();
    });
    cancelled.page.once("dialog", (dialog) => dialog.dismiss());
    await cancelled.page.getByRole("button", { name: "Disconnect" }).click();
    expect(deleteCalls).toBe(0);
    await expect(cancelled.page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await cancelled.page.close();

    const confirmed = await settingsPage(connected);
    let pending: Route | undefined;
    await confirmed.page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/, async (route) => {
      if (route.request().method() === "DELETE") pending = route;
      else await route.fallback();
    });
    confirmed.page.once("dialog", (dialog) => dialog.accept());
    const disconnect = confirmed.page.getByRole("button", {
      name: "Disconnect"
    });
    await disconnect.click();
    await expect(disconnect.isDisabled()).resolves.toBe(true);
    await expect(confirmed.page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await pending!.fulfill(
      json({
        connection: disconnected,
        providerRevocation: {
          status: "ACTION_REQUIRED",
          manualRevocationUrl: "https://www.instagram.com/accounts/manage_access/"
        }
      })
    );
    await confirmed.page.getByText("No account connected", { exact: true }).waitFor();
    await expect(confirmed.page.getByText("No account connected", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(confirmed.page.getByRole("button", { name: "Refresh token" }).isDisabled()).resolves.toBe(true);
    await expect(confirmed.page.getByRole("button", { name: "Disconnect" }).isDisabled()).resolves.toBe(true);
    await expect(
      confirmed.page
        .getByText(
          "Instagram was disconnected from MARKOS and its local credential was removed. To finish on Instagram, open Apps and websites and select Remove next to MarkOS AI-IG."
        )
        .isVisible()
    ).resolves.toBe(true);
    const requiredAction = confirmed.page.getByRole("link", {
      name: "Finish on Instagram"
    });
    await expect(requiredAction.isVisible()).resolves.toBe(true);
    await expect(requiredAction.getAttribute("href")).resolves.toBe("https://www.instagram.com/accounts/manage_access/");
    await confirmed.page.close();

    const unconfirmed = await settingsPage(connected);
    await unconfirmed.page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/, async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill(
          json({
            connection: disconnected,
            providerRevocation: {
              status: "UNCONFIRMED",
              manualRevocationUrl: "https://www.instagram.com/accounts/manage_access/"
            }
          })
        );
      } else await route.fallback();
    });
    unconfirmed.page.once("dialog", (dialog) => dialog.accept());
    await unconfirmed.page.getByRole("button", { name: "Disconnect" }).click();
    await unconfirmed.page.getByText(/To finish on Instagram/).waitFor();
    await expect(unconfirmed.page.getByText("No account connected", { exact: true }).isVisible()).resolves.toBe(true);
    const manualAction = unconfirmed.page.getByRole("link", {
      name: "Finish on Instagram"
    });
    await expect(manualAction.isVisible()).resolves.toBe(true);
    await expect(manualAction.getAttribute("href")).resolves.toBe("https://www.instagram.com/accounts/manage_access/");
    await unconfirmed.page.close();

    const failed = await settingsPage(connected);
    await failed.page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/, async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Disconnect is temporarily unavailable." }
          })
        });
      } else await route.fallback();
    });
    failed.page.once("dialog", (dialog) => dialog.accept());
    await failed.page.getByRole("button", { name: "Disconnect" }).click();
    await failed.page.locator('[data-notification-toast][role="alert"]').getByText("Disconnect is temporarily unavailable.").waitFor();
    await expect(failed.page.getByText("@markos_business").isVisible()).resolves.toBe(true);
    await failed.page.close();
  });

  it("requires interactive login after terminal renewal failure and lands on profile settings", async () => {
    const page = await browserPage();
    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), storedIdentity);
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;

      if (pathname === "/v1/auth/refresh") {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INVALID_REFRESH_TOKEN",
              message: "Refresh token is invalid or expired"
            }
          })
        });
      }
      if (pathname === "/v1/auth/login") return route.fulfill(json(session));
      if (pathname === "/v1/workspace/instagram") return route.fulfill(json(disconnected));
      if (pathname === "/v1/billing/summary") return route.fulfill(json({ invoices: [], payments: [] }));
      if (pathname === "/v1/workspace/audit-logs") return route.fulfill(json([]));
      return route.fulfill({ status: 404, body: "{}" });
    });

    await page.goto(`${baseUrl}/en/app/settings`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForURL(/\/en\/login\?reason=session-expired$/);
    await page.getByText("Your session expired. Sign in again to continue to your profile.").waitFor();
    await page.locator('input[autocomplete="email"]').fill("owner@markos.test");
    await page.locator('input[autocomplete="current-password"]').fill("CorrectHorseBattery99!");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/en\/app\/settings#profile$/);
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    await expect(page.locator("#profile").getByText("owner@markos.test").isVisible()).resolves.toBe(true);

    await page.close();
  });

  it("serializes cookie refresh across tabs", async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 }
    });
    await context.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), storedIdentity);
    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;
    let refreshCalls = 0;

    await context.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/v1/auth/refresh") {
        refreshCalls += 1;
        activeRefreshes += 1;
        maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
        await new Promise((resolve) => setTimeout(resolve, 75));
        activeRefreshes -= 1;
        return route.fulfill(
          json({
            ...session,
            tokens: {
              accessToken: `browser-session-token-${refreshCalls}`,
              expiresIn: 900
            }
          })
        );
      }
      if (pathname === "/v1/workspace/instagram") return route.fulfill(json(disconnected));
      if (pathname === "/v1/billing/summary") return route.fulfill(json({ invoices: [], payments: [] }));
      if (pathname === "/v1/workspace/audit-logs") return route.fulfill(json([]));
      return route.fulfill({ status: 404, body: "{}" });
    });

    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([
      first.goto(`${baseUrl}/en/app/settings`, {
        waitUntil: "domcontentloaded"
      }),
      second.goto(`${baseUrl}/en/app/settings`, {
        waitUntil: "domcontentloaded"
      })
    ]);
    await Promise.all([
      first.getByRole("heading", { name: "Settings", exact: true }).waitFor(),
      second.getByRole("heading", { name: "Settings", exact: true }).waitFor()
    ]);

    expect(refreshCalls).toBe(2);
    expect(maxActiveRefreshes).toBe(1);
    await context.close();
  });
});

async function settingsPage(connection: Record<string, unknown>, path = "/en/app/settings#connections", mfaEnabled = true) {
  const page = await browserPage();
  const requests: string[] = [];
  let currentMfaEnabled = mfaEnabled;
  await page.addInitScript((value) => {
    const seededKey = "markos.browser-test.session-seeded";
    if (sessionStorage.getItem(seededKey)) return;

    localStorage.setItem("markos.session", JSON.stringify(value));
    sessionStorage.setItem(seededKey, "true");
  }, storedIdentity);
  await page.route("https://media.markos.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    })
  );
  await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
    const request = route.request();
    requests.push(request.url());
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/v1/auth/refresh") return route.fulfill(json(session));
    if (pathname === "/v1/auth/logout") return route.fulfill(json({ loggedOut: true }));
    if (pathname === "/v1/auth/mfa/totp") return route.fulfill(json({ enabled: currentMfaEnabled }));
    if (pathname === "/v1/workspace/instagram" && request.method() === "GET") return route.fulfill(json(connection));
    if (pathname === "/v1/billing/summary") return route.fulfill(json({ invoices: [], payments: [] }));
    if (pathname === "/v1/workspace/audit-logs") return route.fulfill(json([]));
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Unexpected mocked request" }
      })
    });
  });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", {
      name: path.startsWith("/ar/") ? "الإعدادات" : "Settings",
      exact: true
    })
    .waitFor();
  return {
    page,
    requests,
    setMfaEnabled: (enabled: boolean) => {
      currentMfaEnabled = enabled;
    }
  };
}

async function browserPage(): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 }
  });
  return context.newPage();
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data })
  };
}

function browserBusinessProfile() {
  const localized = {
    en: "Grounded English business profile.",
    ar: "ملف نشاط عربي موثوق."
  };

  return {
    businessName: "Pearl Coffee",
    tagline: localized,
    overview: localized,
    uniqueValue: localized,
    offerSummary: localized,
    idealCustomer: localized,
    marketPosition: localized,
    brandVoice: localized,
    marketingFocus: localized
  };
}
