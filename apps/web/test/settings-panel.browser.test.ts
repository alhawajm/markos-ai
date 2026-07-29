import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
const describeBrowser = baseUrl ? describe : describe.skip;
let browser: Browser;
const session = {
  tokens: {
    accessToken: "browser-session-token",
    refreshToken: "browser-refresh-token",
  },
  user: {
    id: "user-1",
    email: "owner@markos.test",
    fullName: "Browser Owner",
    locale: "en",
    isVerified: true,
  },
  workspace: { id: "workspace-1", name: "Browser Workspace" },
  roles: ["OWNER"],
};
const disconnected = {
  connected: false,
  status: "DISCONNECTED",
  recentMedia: [],
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
      permalink: "https://instagram.test/p/image-1",
    },
    { id: "video-1", mediaType: "VIDEO" },
  ],
};

describeBrowser("active SettingsPanel Instagram interactions", () => {
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    mkdirSync("evidence", { recursive: true });
  });
  afterAll(async () => {
    await browser.close();
  });

  it("is the active route, renders a truthful disconnected state, and prevents duplicate connect requests", async () => {
    const { page, requests } = await settingsPage(disconnected);
    await expect(
      page.getByRole("heading", { name: "Settings" }).isVisible(),
    ).resolves.toBe(true);
    await expect(
      page.getByText("Not set", { exact: true }).isVisible(),
    ).resolves.toBe(true);
    await expect(
      page.getByText("Dry run", { exact: true }).isVisible(),
    ).resolves.toBe(true);
    await expect(page.getByText("Zain Arabia").count()).resolves.toBe(0);
    await expect(
      page.getByRole("button", { name: "Refresh token" }).isDisabled(),
    ).resolves.toBe(true);
    await expect(
      page.getByRole("button", { name: "Disconnect" }).isDisabled(),
    ).resolves.toBe(true);
    const connect = page.getByRole("button", { name: "Connect OAuth" });
    let pending: Route | undefined;
    await page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/oauth\/start$/,
      async (route) => {
        requests.push(route.request().url());
        expect(route.request().postDataJSON()).toEqual({
          locale: "en",
          returnTo: "/en/app/settings",
        });
        pending = route;
      },
    );
    await connect.press("Enter");
    await expect(connect.isDisabled()).resolves.toBe(true);
    await connect.click({ force: true });
    expect(requests.filter((url) => url.endsWith("/oauth/start"))).toHaveLength(
      1,
    );
    await pending!.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Instagram connection is temporarily unavailable." },
      }),
    });
    const status = page.getByRole("status");
    await status
      .getByText("Instagram connection is temporarily unavailable.")
      .waitFor();
    await expect(
      status
        .getByText("Instagram connection is temporarily unavailable.")
        .isVisible(),
    ).resolves.toBe(true);
    await page.screenshot({
      path: "evidence/settings-instagram-disconnected.png",
      fullPage: true,
    });
    await page.close();
  });

  it("processes callback results once, cleans sensitive query values, and renders sanitized mixed media", async () => {
    const { page } = await settingsPage(
      connected,
      "/en/app/settings?instagram=connected&code=provider-code&state=provider-state&tab=accounts&error_reason=none",
    );
    await page.getByText("@markos_business").waitFor();
    await expect(page.getByText("@markos_business").isVisible()).resolves.toBe(
      true,
    );
    await expect(page.getByText("Bahrain launch").isVisible()).resolves.toBe(
      true,
    );
    await expect(
      page.getByText("VIDEO", { exact: true }).isVisible(),
    ).resolves.toBe(true);
    await expect(
      page.getByRole("img", { name: "Bahrain launch" }).isVisible(),
    ).resolves.toBe(true);
    await expect(
      page.getByText(/7\/29\/2026|29\/07\/2026/).count(),
    ).resolves.toBeGreaterThan(0);
    expect(page.url()).toBe(`${baseUrl}/en/app/settings?tab=accounts`);
    const content = await page.locator("body").innerText();
    for (const secret of [
      "provider-code",
      "provider-state",
      "ciphertext",
      "access_token",
      "app_secret",
    ])
      expect(content).not.toContain(secret);
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByText("Instagram connection saved.").count(),
    ).resolves.toBe(0);

    const malformed = await settingsPage(
      connected,
      "/en/app/settings?instagram=unsupported&code=provider-code&state=provider-state&safe=retained",
    );
    expect(malformed.page.url()).toBe(
      `${baseUrl}/en/app/settings?safe=retained`,
    );
    await expect(malformed.page.getByRole("status").count()).resolves.toBe(0);
    await malformed.page.close();
    await page.screenshot({
      path: "evidence/settings-instagram-connected.png",
      fullPage: true,
    });
    await page.close();
  });

  it("renders empty and reauthorization states without claiming normal connection or revocation", async () => {
    const empty = await settingsPage({ ...connected, recentMedia: [] });
    await empty.page
      .getByText("No recent media was returned for this account.")
      .waitFor();
    await expect(
      empty.page
        .getByText("No recent media was returned for this account.")
        .isVisible(),
    ).resolves.toBe(true);
    await empty.page.close();

    const expired = await settingsPage({
      ...connected,
      connected: false,
      status: "REAUTHORIZE_REQUIRED",
    });
    await expired.page.getByText("reauthorize", { exact: true }).waitFor();
    await expect(
      expired.page.getByText("reauthorize", { exact: true }).isVisible(),
    ).resolves.toBe(true);
    await expect(expired.page.getByText(/revoked/i).count()).resolves.toBe(0);
    await expect(
      expired.page.getByRole("button", { name: "Connect OAuth" }).isEnabled(),
    ).resolves.toBe(true);
    await expect(
      expired.page.getByRole("button", { name: "Refresh token" }).isDisabled(),
    ).resolves.toBe(true);
    await expired.page.close();
  });

  it("refreshes once, updates only after confirmation, and preserves the connection on transient failure", async () => {
    const success = await settingsPage(connected);
    let pending: Route | undefined;
    let calls = 0;
    await success.page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/refresh$/,
      async (route) => {
        calls += 1;
        pending = route;
      },
    );
    const refresh = success.page.getByRole("button", { name: "Refresh token" });
    await refresh.click();
    await expect(refresh.isDisabled()).resolves.toBe(true);
    await refresh.click({ force: true });
    expect(calls).toBe(1);
    await expect(
      success.page.getByText("@markos_business").isVisible(),
    ).resolves.toBe(true);
    await pending!.fulfill(
      json({
        refreshed: true,
        connection: { ...connected, username: "refreshed_business" },
      }),
    );
    await success.page.getByText("@refreshed_business").waitFor();
    await expect(
      success.page.getByText("@refreshed_business").isVisible(),
    ).resolves.toBe(true);
    await success.page.close();

    const failure = await settingsPage(connected);
    await failure.page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/refresh$/,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Refresh is temporarily unavailable." },
          }),
        }),
    );
    await failure.page.getByRole("button", { name: "Refresh token" }).click();
    await failure.page
      .getByRole("status")
      .getByText("Refresh is temporarily unavailable.")
      .waitFor();
    await expect(
      failure.page.getByText("@markos_business").isVisible(),
    ).resolves.toBe(true);
    await expect(
      failure.page
        .getByRole("status")
        .getByText("Refresh is temporarily unavailable.")
        .isVisible(),
    ).resolves.toBe(true);
    await failure.page.close();
  });

  it("preserves connection on reconnect failure and cancellation", async () => {
    const { page } = await settingsPage(
      connected,
      "/en/app/settings?instagram=error&tab=accounts",
    );
    await page.getByText("@markos_business").waitFor();
    await expect(page.getByText("@markos_business").isVisible()).resolves.toBe(
      true,
    );
    await expect(
      page
        .getByRole("status")
        .getByText(
          "Instagram authorization could not be completed. Try connecting again.",
        )
        .isVisible(),
    ).resolves.toBe(true);
    expect(page.url()).toBe(`${baseUrl}/en/app/settings?tab=accounts`);
    await page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram\/oauth\/start$/,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Reconnect was not completed." },
          }),
        }),
    );
    await page.getByRole("button", { name: "Reconnect" }).click();
    await page
      .getByRole("status")
      .getByText("Reconnect was not completed.")
      .waitFor();
    await expect(page.getByText("@markos_business").isVisible()).resolves.toBe(
      true,
    );
    await expect(
      page
        .getByRole("status")
        .getByText("Reconnect was not completed.")
        .isVisible(),
    ).resolves.toBe(true);
    await page.close();
  });

  it("requires disconnect confirmation, sends one request, and changes state only after backend success", async () => {
    const cancelled = await settingsPage(connected);
    let deleteCalls = 0;
    await cancelled.page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/,
      async (route) => {
        if (route.request().method() === "DELETE") deleteCalls += 1;
        await route.fallback();
      },
    );
    cancelled.page.once("dialog", (dialog) => dialog.dismiss());
    await cancelled.page.getByRole("button", { name: "Disconnect" }).click();
    expect(deleteCalls).toBe(0);
    await expect(
      cancelled.page.getByText("@markos_business").isVisible(),
    ).resolves.toBe(true);
    await cancelled.page.close();

    const confirmed = await settingsPage(connected);
    let pending: Route | undefined;
    await confirmed.page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/,
      async (route) => {
        if (route.request().method() === "DELETE") pending = route;
        else await route.fallback();
      },
    );
    confirmed.page.once("dialog", (dialog) => dialog.accept());
    const disconnect = confirmed.page.getByRole("button", {
      name: "Disconnect",
    });
    await disconnect.click();
    await expect(disconnect.isDisabled()).resolves.toBe(true);
    await expect(
      confirmed.page.getByText("@markos_business").isVisible(),
    ).resolves.toBe(true);
    await pending!.fulfill(json(disconnected));
    await confirmed.page.getByText("Not set", { exact: true }).waitFor();
    await expect(
      confirmed.page.getByText("Not set", { exact: true }).isVisible(),
    ).resolves.toBe(true);
    await expect(
      confirmed.page
        .getByRole("button", { name: "Refresh token" })
        .isDisabled(),
    ).resolves.toBe(true);
    await expect(
      confirmed.page.getByRole("button", { name: "Disconnect" }).isDisabled(),
    ).resolves.toBe(true);
    await confirmed.page.close();

    const failed = await settingsPage(connected);
    await failed.page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):4000\/v1\/workspace\/instagram$/,
      async (route) => {
        if (route.request().method() === "DELETE") {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: { message: "Disconnect is temporarily unavailable." },
            }),
          });
        } else await route.fallback();
      },
    );
    failed.page.once("dialog", (dialog) => dialog.accept());
    await failed.page.getByRole("button", { name: "Disconnect" }).click();
    await failed.page
      .getByRole("status")
      .getByText("Disconnect is temporarily unavailable.")
      .waitFor();
    await expect(
      failed.page.getByText("@markos_business").isVisible(),
    ).resolves.toBe(true);
    await failed.page.close();
  });
});

async function settingsPage(
  connection: Record<string, unknown>,
  path = "/en/app/settings",
) {
  const page = await browserPage();
  const requests: string[] = [];
  await page.addInitScript(
    (value) => localStorage.setItem("markos.session", JSON.stringify(value)),
    session,
  );
  await page.route("https://media.markos.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route(
    /^http:\/\/(?:127\.0\.0\.1|localhost):4000\//,
    async (route) => {
      const request = route.request();
      requests.push(request.url());
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/v1/workspace/instagram" && request.method() === "GET")
        return route.fulfill(json(connection));
      if (pathname === "/v1/billing/summary")
        return route.fulfill(json({ invoices: [], payments: [] }));
      if (pathname === "/v1/workspace/audit-logs")
        return route.fulfill(json([]));
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Unexpected mocked request" },
        }),
      });
    },
  );
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  return { page, requests };
}

async function browserPage(): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  return context.newPage();
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  };
}
