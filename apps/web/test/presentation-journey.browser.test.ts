import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered presentation-journey tests");

let browser: Browser;
const session = {
  mfaVerified: true,
  tokens: { accessToken: "presentation-session-token", expiresIn: 900 },
  user: {
    id: "user-presentation",
    email: "owner@snacklab.test",
    fullName: "SnackLab Owner",
    locale: "en",
    isVerified: true
  },
  workspace: { id: "workspace-snacklab", name: "SnackLab", slug: "snacklab" },
  roles: ["OWNER"]
};
const storedIdentity = { roles: session.roles, user: session.user, workspace: session.workspace };
const completedSections = ["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"];

describe("presentation journey", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("redirects an approved workspace away from onboarding", async () => {
    const page = await sessionPage();
    await page.addInitScript(() => localStorage.setItem("markos.onboarding.draft.v2", JSON.stringify({ companyName: "stale" })));
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/onboarding") {
        return route.fulfill(
          json({
            status: "COMPLETE",
            businessProfile: { status: "APPROVED", interactionId: "profile-1", profile: null, updatedAt: "2026-08-09T11:30:00.000Z" }
          })
        );
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/onboarding`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${baseUrl}/en/app`);
    await expect(page.getByRole("heading", { name: "Tell us about your company" }).count()).resolves.toBe(0);
    await expect(page.evaluate(() => localStorage.getItem("markos.onboarding.draft.v2"))).resolves.toBeNull();
    await page.close();
  });

  it("renders live Vault completion and timestamps instead of the fixed presentation fixture", async () => {
    const page = await sessionPage();
    let scoreRequests = 0;
    let vaultRequests = 0;
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/vault/score") {
        scoreRequests += 1;
        return route.fulfill(
          json({ score: 100, completedSections, missingSections: [], requiredSections: completedSections, entryCount: completedSections.length })
        );
      }

      if (pathname === "/v1/vault") {
        vaultRequests += 1;
        return route.fulfill(json(snackLabVault()));
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/knowledge`, { waitUntil: "domcontentloaded" });
    await page.getByText("7 of 7 modules complete", { exact: true }).waitFor();
    await expect(page.getByText("100%", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByLabel("Competitors complete").isVisible()).resolves.toBe(true);
    await expect(page.getByText("May 15, 2026").count()).resolves.toBe(0);
    await expect(page.getByText("Last updated: Never").count()).resolves.toBe(0);
    expect(scoreRequests).toBe(1);
    expect(vaultRequests).toBe(1);
    await page.close();
  });

  it("exposes Strategy in the authenticated app and sends a real 30-day generation request", async () => {
    const page = await sessionPage();
    let generationPayload: Record<string, unknown> | undefined;
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/strategy" && route.request().method() === "GET") return route.fulfill(json([]));
      if (pathname === "/v1/strategy/generate" && route.request().method() === "POST") {
        generationPayload = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json(snackLabStrategy()));
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/strategy`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Strategy", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "Strategy" }).getAttribute("aria-current")).resolves.toBe("page");
    await expect(page.getByLabel("Horizon").inputValue()).resolves.toBe("30");
    await expect(page.getByText("No strategy generated yet", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText(/Zain Arabia/).count()).resolves.toBe(0);

    await page.getByRole("button", { name: "Generate with AI" }).click();
    await page.getByRole("heading", { name: "SnackLab 30-Day Instagram Strategy" }).waitFor();
    expect(generationPayload).toEqual({
      horizonDays: 30,
      locale: "en",
      objective: "Increase qualified Instagram inquiries over the next 30 days"
    });
    await page.close();
  });
});

async function sessionPage(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await page.addInitScript((identity) => localStorage.setItem("markos.session", JSON.stringify(identity)), storedIdentity);
  return page;
}

async function mockApi(page: Page, handler: (route: Route, pathname: string) => Promise<unknown>) {
  await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/v1/auth/refresh") return route.fulfill(json(session));
    await handler(route, pathname);
  });
}

function snackLabVault() {
  const entry = (section: string, key: string) => [
    {
      createdAt: "2026-08-09T11:30:00.000Z",
      id: `${section}-${key}`,
      key,
      section,
      updatedAt: "2026-08-09T11:30:00.000Z",
      value: { business: "SnackLab" },
      version: 1,
      workspaceId: session.workspace.id
    }
  ];

  return {
    AUDIENCE: entry("AUDIENCE", "target-audience"),
    BRAND: entry("BRAND", "brand-identity"),
    COMPANY: entry("COMPANY", "company-info"),
    COMPETITORS: entry("COMPETITORS", "competitors"),
    OBJECTIVES: entry("OBJECTIVES", "content-goals"),
    PRODUCTS: entry("PRODUCTS", "products-services"),
    STORY: entry("STORY", "business-story"),
    TONE: entry("TONE", "brand-tone")
  };
}

function snackLabStrategy() {
  return {
    content: {
      horizonDays: 30,
      kpis: [{ name: "Qualified inquiries", target: "30" }],
      nextActions: ["Create the first weekly content batch"],
      objectives: ["Build awareness", "Generate subscription inquiries", "Convert recurring customers"],
      pillars: [
        {
          contentAngles: ["Dessert experiments", "Subscription tiers"],
          name: "Sweet experimentation",
          rationale: "Show the playful discovery behind SnackLab."
        }
      ],
      retrievedContext: [{ id: "ctx-company", key: "company-info", score: 0.98, section: "COMPANY", value: { name: "SnackLab" }, version: 1 }],
      risks: [],
      summary: "A Vault-grounded 30-day Instagram strategy for SnackLab.",
      weeklyCadence: [{ actions: ["Publish one Reel", "Publish one carousel"], focus: "Launch consistency", week: 1 }]
    },
    createdAt: "2026-08-09T11:35:00.000Z",
    horizonDays: 30,
    id: "strategy-snacklab-30",
    title: "SnackLab 30-Day Instagram Strategy",
    updatedAt: "2026-08-09T11:35:00.000Z",
    version: 1,
    workspaceId: session.workspace.id
  };
}

function json(data: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data }) };
}
