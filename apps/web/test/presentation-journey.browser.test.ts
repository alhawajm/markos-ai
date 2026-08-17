import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered presentation-journey tests");

let browser: Browser;
const session = {
  mfaVerified: true,
  mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
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
    await page.waitForURL(`${baseUrl}/en/app/strategy`);
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
    await page.getByText("7 of 7 sections", { exact: true }).waitFor();
    await expect(page.getByText("100%", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByLabel("Competitors complete").isVisible()).resolves.toBe(true);
    await expect(page.getByText("May 15, 2026").count()).resolves.toBe(0);
    await expect(page.getByText("Last updated: Never").count()).resolves.toBe(0);
    await page.screenshot({ path: "evidence/sunlit-business-profile.png", fullPage: true });
    expect(scoreRequests).toBeGreaterThan(0);
    expect(vaultRequests).toBeGreaterThan(0);
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

    await page.getByRole("button", { name: "Create Strategy" }).click();
    await page.getByRole("heading", { name: "SnackLab 30-Day Instagram Strategy" }).waitFor();
    await expect(page.getByRole("button", { name: "Export" }).count()).resolves.toBe(0);
    await expect(page.getByText("Create the first weekly content batch", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("heading", { name: "Your weekly plan" }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Why MARKOS recommended this", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText(/COMPANY \/ company-info/).count()).resolves.toBe(0);
    await page.screenshot({ path: "evidence/sunlit-strategy.png", fullPage: true });
    expect(generationPayload).toEqual({
      horizonDays: 30,
      locale: "en",
      objective: "Increase qualified Instagram inquiries over the next 30 days"
    });
    await page.close();
  });

  it("renders the desktop overview, Create, and honest Insights destinations", async () => {
    const page = await sessionPage();
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/content" || pathname === "/v1/publishing/queue") return route.fulfill(json([]));
      if (pathname === "/v1/vault/score") {
        return route.fulfill(
          json({ score: 100, completedSections, missingSections: [], requiredSections: completedSections, entryCount: completedSections.length })
        );
      }
      if (pathname === "/v1/analytics") return route.fulfill(json(emptyAnalyticsSummary()));
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Welcome back, SnackLab" }).waitFor();
    await expect(page.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).resolves.toBe("page");
    await page.screenshot({ path: "evidence/sunlit-overview.png", fullPage: true });

    await page.goto(`${baseUrl}/en/app/content-studio`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Turn an idea into your next post." }).waitFor();
    await expect(page.getByRole("button", { name: "Create draft" }).isVisible()).resolves.toBe(true);
    await page.screenshot({ path: "evidence/sunlit-create.png", fullPage: true });

    await page.goto(`${baseUrl}/en/app/analytics`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Insights", exact: true }).waitFor();
    await expect(page.getByText("No synced insight data yet", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Live", { exact: true }).count()).resolves.toBe(0);
    await page.screenshot({ path: "evidence/sunlit-insights.png", fullPage: true });
    await page.close();
  });

  it("creates, edits, uploads, generates media, approves, schedules, and cancels a saved content item", async () => {
    const page = await sessionPage();
    let record: ReturnType<typeof studioContentRecord> & { scheduledAt?: string; status: string } = studioContentRecord();
    const mediaAssets: Array<Record<string, unknown>> = [];
    let generationPayload: Record<string, unknown> | undefined;
    let updatePayload: Record<string, unknown> | undefined;
    let uploadPayload: Record<string, unknown> | undefined;
    let imageGenerationPayload: Record<string, unknown> | undefined;
    let schedulePayload: Record<string, unknown> | undefined;
    let unscheduleCalls = 0;
    const statusTransitions: string[] = [];

    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();

      if (pathname === "/v1/content" && method === "GET") return route.fulfill(json([]));
      if (pathname === "/v1/media" && method === "GET") return route.fulfill(json(mediaAssets));
      if (pathname === "/v1/content/generate" && method === "POST") {
        generationPayload = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json([record]));
      }
      if (pathname === `/v1/content/${record.id}` && method === "PATCH") {
        updatePayload = route.request().postDataJSON() as Record<string, unknown>;
        record = { ...record, ...updatePayload, updatedAt: "2026-08-17T10:01:00.000Z" };
        return route.fulfill(json(record));
      }
      if (pathname === "/v1/media/upload" && method === "POST") {
        uploadPayload = route.request().postDataJSON() as Record<string, unknown>;
        const asset = {
          createdAt: "2026-08-17T10:02:00.000Z",
          filename: uploadPayload.filename,
          height: uploadPayload.height,
          id: "media-uploaded",
          mimeType: uploadPayload.mimeType,
          publicUrl: onePixelJpegDataUrl,
          sizeBytes: 631,
          type: "IMAGE",
          updatedAt: "2026-08-17T10:02:00.000Z",
          width: uploadPayload.width,
          workspaceId: session.workspace.id
        };
        mediaAssets.unshift(asset);
        return route.fulfill(json(asset));
      }
      if (pathname === `/v1/content/${record.id}/media` && method === "POST") {
        const payload = route.request().postDataJSON() as { mediaAssetId: string };
        record = { ...record, mediaIds: Array.from(new Set([...record.mediaIds, payload.mediaAssetId])) };
        return route.fulfill(json(record));
      }
      if (pathname === `/v1/content/${record.id}/generate-image` && method === "POST") {
        imageGenerationPayload = route.request().postDataJSON() as Record<string, unknown>;
        const mediaAsset = {
          createdAt: "2026-08-17T10:03:00.000Z",
          filename: "generated-concept.svg",
          height: 1350,
          id: "media-generated",
          mimeType: "image/svg+xml",
          publicUrl:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='1350'%3E%3Crect width='100%25' height='100%25' fill='%23d93f7a'/%3E%3C/svg%3E",
          sizeBytes: 180,
          type: "AI_GENERATED",
          updatedAt: "2026-08-17T10:03:00.000Z",
          width: 1080,
          workspaceId: session.workspace.id
        };
        mediaAssets.unshift(mediaAsset);
        record = { ...record, mediaIds: Array.from(new Set([...record.mediaIds, mediaAsset.id])) };
        return route.fulfill(json({ contentItem: record, mediaAsset, model: "local-image-generator", prompt: "saved caption", promptVersion: "image.v1" }));
      }
      if (pathname === `/v1/content/${record.id}/status` && method === "POST") {
        const payload = route.request().postDataJSON() as { status: string };
        statusTransitions.push(payload.status);
        record = { ...record, status: payload.status };
        return route.fulfill(json(record));
      }
      if (pathname === `/v1/content/${record.id}/schedule` && method === "POST") {
        schedulePayload = route.request().postDataJSON() as Record<string, unknown>;
        record = { ...record, scheduledAt: schedulePayload.scheduledAt as string, status: "SCHEDULED" };
        return route.fulfill(json(record));
      }
      if (pathname === `/v1/content/${record.id}/unschedule` && method === "POST") {
        unscheduleCalls += 1;
        const { scheduledAt: _scheduledAt, ...withoutSchedule } = record;
        record = { ...withoutSchedule, status: "APPROVED" };
        return route.fulfill(json(record));
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/content-studio`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Describe the content you want MARKOS/).fill("Launch our new Bahrain dessert subscription to busy professionals.");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.getByText("Draft generated and saved to this workspace.", { exact: true }).waitFor();

    const captionEditor = page.getByPlaceholder("Generated caption will appear here after MARKOS creates a draft.");
    await captionEditor.fill("A fresh dessert ritual for busy Bahrain teams.");
    await page.getByRole("button", { name: "العربية", exact: true }).click();
    await captionEditor.fill("طقوس حلوة جديدة لفرق العمل في البحرين.");
    await page.getByRole("button", { name: "Save edits", exact: true }).click();
    await page.getByText("Edits saved to the workspace draft.", { exact: true }).waitFor();

    await page.getByLabel("Upload JPEG").setInputFiles({
      buffer: Buffer.from(onePixelJpegBase64, "base64"),
      mimeType: "image/jpeg",
      name: "showcase.jpg"
    });
    await page.getByText("showcase.jpg uploaded and attached to this workspace draft.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Generate image", exact: true }).click();
    await page.getByText("Image concept generated, saved, and attached to this draft.", { exact: true }).waitFor();
    await page.screenshot({ path: "evidence/sunlit-content-studio-flow.png", fullPage: true });

    await page.getByRole("button", { name: "Approve draft", exact: true }).click();
    await page.getByText("Content approved. It is now eligible for scheduling.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    await page.getByText("Scheduled for 7:30 PM.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Cancel schedule", exact: true }).click();
    await page.getByText("Schedule cancelled. The approved item has returned to the ready queue.", { exact: true }).waitFor();

    expect(generationPayload).toEqual({ contentType: "POST", count: 1, topic: "Launch our new Bahrain dessert subscription to busy professionals." });
    expect(updatePayload).toMatchObject({
      captionAr: "طقوس حلوة جديدة لفرق العمل في البحرين.",
      captionEn: "A fresh dessert ritual for busy Bahrain teams."
    });
    expect(uploadPayload).toMatchObject({ filename: "showcase.jpg", height: 1, mimeType: "image/jpeg", type: "IMAGE", width: 1 });
    expect(typeof uploadPayload?.base64Data).toBe("string");
    expect(imageGenerationPayload).toEqual({ aspectRatio: "4:5" });
    expect(statusTransitions).toEqual(["IN_REVIEW", "APPROVED"]);
    expect(typeof schedulePayload?.scheduledAt).toBe("string");
    expect(unscheduleCalls).toBe(1);
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

function emptyAnalyticsSummary() {
  return {
    byMetricType: [],
    daily: [],
    days: 7,
    from: "2026-08-03",
    records: [],
    to: "2026-08-09",
    topContent: [],
    totals: { comments: 0, engagement: 0, followers: 0, impressions: 0, likes: 0, profileViews: 0, reach: 0, saves: 0, shares: 0, views: 0 }
  };
}

function studioContentRecord() {
  return {
    callToAction: "Subscribe today",
    captionAr: "اكتشفوا اشتراك الحلويات الجديد.",
    captionEn: "Discover our new dessert subscription.",
    contentPillar: "Product launch",
    contentType: "POST",
    createdAt: "2026-08-17T10:00:00.000Z",
    hashtags: ["#SnackLab", "#Bahrain"],
    id: "content-showcase",
    mediaIds: [] as string[],
    status: "DRAFT",
    updatedAt: "2026-08-17T10:00:00.000Z",
    workspaceId: session.workspace.id
  };
}

const onePixelJpegBase64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";
const onePixelJpegDataUrl = `data:image/jpeg;base64,${onePixelJpegBase64}`;

function json(data: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data }) };
}
