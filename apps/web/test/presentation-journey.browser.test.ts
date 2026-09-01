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
        return route.fulfill(json(approvedOnboardingState("2026-08-09T11:30:00.000Z")));
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/onboarding`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${baseUrl}/en/app/campaigns`);
    await expect(page.getByRole("heading", { name: "Tell us about your company" }).count()).resolves.toBe(0);
    await expect(page.evaluate(() => localStorage.getItem("markos.onboarding.draft.v2"))).resolves.toBeNull();
    await page.close();
  });

  it("offers a document-assisted onboarding path and makes extracted colors editable before saving", async () => {
    const page = await sessionPage();
    await page.setViewportSize({ height: 900, width: 1440 });
    let documentAnalysisFileCount = 0;
    let documentAnalysisPosts = 0;
    let moduleWrites = 0;
    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();
      if (pathname === "/v1/onboarding") return route.fulfill(json(emptyOnboardingState()));
      if (pathname === "/v1/onboarding/products/document-analysis") return route.fulfill(json(null));
      if (pathname === "/v1/onboarding/document-analysis" && method === "GET") return route.fulfill(json(null));
      if (pathname === "/v1/onboarding/document-analysis" && method === "POST") {
        const body = route.request().postDataJSON() as { files?: unknown[] };
        documentAnalysisFileCount = body.files?.length ?? 0;
        documentAnalysisPosts += 1;
        return route.fulfill(json(onboardingDocumentAnalysis()));
      }
      if (method === "PUT" && pathname.startsWith("/v1/onboarding/")) {
        moduleWrites += 1;
        return route.fulfill(json(emptyOnboardingState()));
      }
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/onboarding`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Your marketing starts with understanding your business." }).waitFor();
    const documentCta = await page.getByRole("button", { name: "Use business documents" }).boundingBox();
    const manualCta = await page.getByRole("button", { name: "Enter details myself" }).boundingBox();
    expect(Math.abs((documentCta?.width ?? 0) - (manualCta?.width ?? 0))).toBeLessThan(1);
    await page.screenshot({ path: "evidence/sunlit-onboarding-greeting.png", fullPage: true });
    await page.getByRole("button", { name: "Use business documents" }).click();
    await page.getByRole("heading", { name: "Start with your business files" }).waitFor();
    await page.locator('input[type="file"]').setInputFiles({ name: "brand.txt", mimeType: "text/plain", buffer: Buffer.from("SnackLab brand information") });
    await page.locator('input[type="file"]').setInputFiles({ name: "offerings.pdf", mimeType: "application/pdf", buffer: Buffer.from("SnackLab offerings") });
    await expect(page.getByRole("region", { name: "Selected files" }).getByText("brand", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("region", { name: "Selected files" }).getByText("offerings", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("region", { name: "Selected files" }).getByText("2/5", { exact: true }).isVisible()).resolves.toBe(true);
    await page.screenshot({ path: "evidence/sunlit-onboarding-document-selection.png", fullPage: true });
    expect(documentAnalysisPosts).toBe(0);
    await page.getByRole("button", { name: "Analyze files" }).click();
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor();
    expect(documentAnalysisFileCount).toBe(2);
    expect(documentAnalysisPosts).toBe(1);
    expect(moduleWrites).toBe(0);
    await expect(page.getByText("Information found in your files").isVisible()).resolves.toBe(true);

    await page.getByRole("button", { name: /^Tone of voice/ }).click();
    await page.getByRole("heading", { name: "How should the business sound?" }).waitFor();
    await expect(page.locator('input[type="color"]').count()).resolves.toBe(3);
    await expect(page.getByRole("code").filter({ hasText: "#2B59FF" }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("code").filter({ hasText: "#F97316" }).isVisible()).resolves.toBe(true);
    await page.getByLabel("Choose color").fill("#123456");
    await expect(page.locator('input[type="color"]').count()).resolves.toBe(3);
    await page.screenshot({ path: "evidence/sunlit-onboarding-color-selection.png", fullPage: true });
    await page.getByRole("button", { name: "Add selected color" }).click();
    await expect(page.locator('input[type="color"]').count()).resolves.toBe(4);
    await expect(page.getByRole("code").filter({ hasText: "#123456" }).isVisible()).resolves.toBe(true);
    expect(moduleWrites).toBe(0);
    await page.close();

    const arabicPage = await sessionPage();
    await arabicPage.setViewportSize({ height: 900, width: 1440 });
    await mockApi(arabicPage, async (route, pathname) => {
      if (pathname === "/v1/onboarding") return route.fulfill(json(emptyOnboardingState()));
      if (pathname === "/v1/onboarding/products/document-analysis") return route.fulfill(json(null));
      if (pathname === "/v1/onboarding/document-analysis") return route.fulfill(json(null));
      return route.fulfill(json([]));
    });
    await arabicPage.goto(`${baseUrl}/ar/onboarding`, { waitUntil: "domcontentloaded" });
    await arabicPage.getByRole("heading", { name: "يبدأ تسويقك بفهم نشاطك." }).waitFor();
    await expect(arabicPage.locator("main").getAttribute("dir")).resolves.toBe("rtl");
    await arabicPage.screenshot({ path: "evidence/sunlit-onboarding-greeting-rtl.png", fullPage: true });
    await arabicPage.close();
  });

  it("restores an active document analysis and lets the owner replace it", async () => {
    const page = await sessionPage();
    let discarded = false;
    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();
      if (pathname === "/v1/onboarding") return route.fulfill(json(emptyOnboardingState()));
      if (pathname === "/v1/onboarding/products/document-analysis") return route.fulfill(json(null));
      if (pathname === "/v1/onboarding/document-analysis" && method === "GET") {
        return route.fulfill(json(discarded ? null : onboardingDocumentAnalysis()));
      }
      if (pathname.endsWith("/v1/onboarding/document-analysis/01a05c25-3efd-7ed2-bdcf-5de2e04be57e") && method === "DELETE") {
        discarded = true;
        return route.fulfill(json({ ...onboardingDocumentAnalysis(), status: "DISCARDED" }));
      }
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/onboarding`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor();
    await page.getByRole("button", { name: "Discard and choose different files" }).click();
    await page.getByRole("heading", { name: "Start with your business files" }).waitFor();
    expect(discarded).toBe(true);
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

  it("opens an approved Business Profile in populated onboarding edit mode", async () => {
    const page = await sessionPage();
    let completionRequests = 0;
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/onboarding") {
        return route.fulfill(json(approvedOnboardingState("2026-08-20T06:00:00.000Z")));
      }

      if (pathname === "/v1/onboarding/complete") {
        completionRequests += 1;
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "ONBOARDING_INCOMPLETE", message: "Onboarding is incomplete" } })
        });
      }

      if (pathname === "/v1/vault/score") {
        return route.fulfill(
          json({ score: 100, completedSections, missingSections: [], requiredSections: completedSections, entryCount: completedSections.length })
        );
      }

      if (pathname === "/v1/vault") return route.fulfill(json(snackLabVault()));
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/knowledge`, { waitUntil: "domcontentloaded" });
    const editLink = page.getByRole("link", { name: "Review and edit profile" });
    await expect(editLink.getAttribute("href")).resolves.toBe("/en/onboarding?mode=edit");
    await editLink.click({ timeout: 10_000 });
    await page.waitForURL(`${baseUrl}/en/onboarding?mode=edit`, { timeout: 10_000 });
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Business name/ }).click({ timeout: 10_000 });
    await page.getByRole("heading", { name: "Let’s start with the basics" }).waitFor({ timeout: 10_000 });
    await expect(page.getByLabel("Business name").inputValue()).resolves.toBe("SnackLab");
    await expect(page.getByLabel("Business type").inputValue()).resolves.toBe("Food & Beverage");
    await expect(page.getByLabel("Main market").inputValue()).resolves.toBe("Manama, Bahrain");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("dialog", { name: "Leave this step?" }).count()).resolves.toBe(0);
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor();
    await page.getByRole("button", { name: /^Business name/ }).click();
    await page.getByLabel("Main market").fill("Muharraq, Bahrain");
    await page.getByRole("button", { name: "Back" }).click();
    const backGuard = page.getByRole("dialog", { name: "Leave this step?" });
    await expect(backGuard.isVisible()).resolves.toBe(true);
    await backGuard.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("Main market").inputValue()).resolves.toBe("Muharraq, Bahrain");
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("dialog", { name: "Leave this step?" }).getByRole("button", { name: "Discard changes" }).click();
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor();
    await page.getByRole("button", { name: /^Business name/ }).click();
    await expect(page.getByLabel("Main market").inputValue()).resolves.toBe("Manama, Bahrain");
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(`${baseUrl}/en/app/knowledge`, { timeout: 10_000 });
    expect(completionRequests).toBe(0);
    await page.close();
  });

  it("exposes Campaigns in the authenticated app and sends a real 30-day generation request", async () => {
    const page = await sessionPage();
    let generationPayload: Record<string, unknown> | undefined;
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/campaigns" && route.request().method() === "GET") return route.fulfill(json([]));
      if (pathname === "/v1/campaigns/generate" && route.request().method() === "POST") {
        generationPayload = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json(snackLabCampaign()));
      }

      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/campaigns`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Campaigns", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "Campaigns" }).getAttribute("aria-current")).resolves.toBe("page");
    await expect(page.getByLabel("Duration").inputValue()).resolves.toBe("30");
    await expect(page.getByText("No campaign created yet", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText(/Zain Arabia/).count()).resolves.toBe(0);

    await page.getByRole("button", { name: "Create Campaign" }).click();
    await page.getByRole("heading", { name: "SnackLab 30-Day Instagram Campaign" }).waitFor();
    await expect(page.getByRole("button", { name: "Export" }).count()).resolves.toBe(0);
    await expect(page.getByText("Create the first weekly content batch", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("heading", { name: "Your weekly plan" }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Why MARKOS recommended this", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText(/COMPANY \/ company-info/).count()).resolves.toBe(0);
    await page.screenshot({ path: "evidence/sunlit-campaigns.png", fullPage: true });
    expect(generationPayload).toMatchObject({
      durationDays: 30,
      locale: "en",
      objective: "Increase qualified Instagram inquiries over the next 30 days",
      publishesPerDay: 1,
      startsAt: expect.any(String)
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
    await page.getByRole("heading", { name: "How do you want to start your next post?" }).waitFor();
    await expect(page.getByRole("button", { name: /Start a blank post/ }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: /Draft with MARKOS AI/ }).isVisible()).resolves.toBe(true);
    await page.screenshot({ path: "evidence/sunlit-create.png", fullPage: true });

    await page.goto(`${baseUrl}/en/app/analytics`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Insights", exact: true }).waitFor();
    await expect(page.getByText("No synced insight data yet", { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText("Live", { exact: true }).count()).resolves.toBe(0);
    await page.screenshot({ path: "evidence/sunlit-insights.png", fullPage: true });
    await page.close();
  });

  it("keeps a blank manual post local until meaningful work is explicitly saved", async () => {
    const page = await sessionPage();
    const blankRecord = {
      ...studioContentRecord(),
      callToAction: undefined,
      captionAr: undefined,
      captionEn: undefined,
      contentPillar: undefined,
      hashtags: []
    };
    let blankCreateCalls = 0;
    let blankCreatePayload: Record<string, unknown> | undefined;
    let aiGenerateCalls = 0;

    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();
      if (pathname === "/v1/content" && method === "GET") return route.fulfill(json([]));
      if (pathname === "/v1/content" && method === "POST") {
        blankCreateCalls += 1;
        blankCreatePayload = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json({ ...blankRecord, ...blankCreatePayload }));
      }
      if (pathname === "/v1/content/generate" && method === "POST") {
        aiGenerateCalls += 1;
      }
      if (pathname === "/v1/media" && method === "GET") return route.fulfill(json([]));
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/content-studio`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Start a blank post/ }).click();
    await page.getByText("This draft is not saved yet. MARKOS will create a record only after you save real work.", { exact: true }).waitFor();
    await expect(page.getByRole("heading", { name: "New post draft" }).isVisible()).resolves.toBe(true);
    await expect(page.getByPlaceholder("Write the caption for this post.").isEnabled()).resolves.toBe(true);
    expect(blankCreateCalls).toBe(0);

    await page.getByRole("button", { name: "Back to Create" }).click();
    await expect(page.getByRole("dialog", { name: "Save this draft before leaving?" }).count()).resolves.toBe(0);
    await page.getByRole("heading", { name: "How do you want to start your next post?" }).waitFor();
    expect(blankCreateCalls).toBe(0);

    await page.getByRole("button", { name: /Start a blank post/ }).click();
    await page.getByPlaceholder("Write the caption for this post.").fill("Manual launch reminder for Bahrain.");
    await page.getByLabel("Planned publication").fill("2026-08-28T18:30");
    await page.getByRole("button", { name: "Back to Create" }).click();
    const unsavedDialog = page.getByRole("dialog", { name: "Save this draft before leaving?" });
    await expect(unsavedDialog.isVisible()).resolves.toBe(true);
    await unsavedDialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByRole("heading", { name: "New post draft" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Back to Create" }).click();
    await page.getByRole("dialog", { name: "Save this draft before leaving?" }).getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("heading", { name: "How do you want to start your next post?" }).waitFor();
    expect(blankCreateCalls).toBe(1);
    expect(blankCreatePayload).toEqual({
      callToAction: null,
      captionAr: null,
      captionEn: "Manual launch reminder for Bahrain.",
      contentType: "POST",
      hashtags: [],
      plannedAt: "2026-08-28T15:30:00.000Z"
    });
    expect(aiGenerateCalls).toBe(0);
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
    let deleteCalls = 0;
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
      if (pathname === `/v1/content/${record.id}` && method === "DELETE") {
        deleteCalls += 1;
        return route.fulfill(json({ id: record.id }));
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
          filename: "generated-image.jpg",
          height: 1280,
          id: "media-generated",
          mimeType: "image/jpeg",
          publicUrl: onePixelJpegDataUrl,
          sizeBytes: 631,
          type: "AI_GENERATED",
          updatedAt: "2026-08-17T10:03:00.000Z",
          width: 1024,
          workspaceId: session.workspace.id
        };
        mediaAssets.unshift(mediaAsset);
        record = { ...record, mediaIds: Array.from(new Set([...record.mediaIds, mediaAsset.id])) };
        return route.fulfill(json({ contentItem: record, mediaAsset, model: "gpt-image-2", prompt: "saved caption", promptVersion: "image.v2.openai" }));
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
    await page.getByRole("button", { name: /Draft with MARKOS AI/ }).click();
    await page.getByPlaceholder(/Describe the content, including/).fill("Launch our new Bahrain dessert subscription to busy professionals.");
    await page.getByRole("button", { name: "Generate draft" }).click();
    await page.getByText("Draft generated and saved to this workspace.", { exact: true }).waitFor();

    const captionEditor = page.getByPlaceholder("Write the caption for this post.");
    await captionEditor.fill("A fresh dessert ritual for busy Bahrain teams.");
    await page.getByRole("button", { name: "العربية", exact: true }).click();
    await captionEditor.fill("طقوس حلوة جديدة لفرق العمل في البحرين.");
    await page.getByRole("button", { name: "Save edits", exact: true }).click();
    await page.getByText("Edits saved to the workspace draft.", { exact: true }).waitFor();

    const publishableJpegBase64 = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#d93f7a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
    });
    await page.getByLabel("Upload JPEG").setInputFiles({
      buffer: Buffer.from(publishableJpegBase64, "base64"),
      mimeType: "image/jpeg",
      name: "showcase.jpg"
    });
    await page.getByText("showcase.jpg uploaded and attached to this workspace draft.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Expand showcase.jpg" }).click();
    await expect(page.getByRole("dialog", { name: "Expanded preview of showcase.jpg" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Close expanded image" }).click();
    await page.getByRole("button", { name: "Generate image", exact: true }).click();
    await page.getByText("AI image generated, saved, and attached to this draft.", { exact: true }).waitFor();
    await page.screenshot({ path: "evidence/sunlit-content-studio-flow.png", fullPage: true });

    await page.getByRole("button", { name: "Mark as ready", exact: true }).click();
    await page.getByText("Content marked Ready. It is now eligible for scheduling.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    await page.getByText("Scheduled for 7:30 PM.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Back to Create" }).click();
    await page.getByRole("button", { name: /Continue a draft/ }).click();
    await expect(page.getByRole("heading", { name: "Content and schedule" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Scheduled 1", exact: true }).click();
    const scheduledItem = page.getByText(/^Scheduled · /);
    await expect(scheduledItem.isVisible()).resolves.toBe(true);
    await scheduledItem.click();
    await page.getByRole("button", { name: "Cancel schedule", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Cancel this scheduled post?" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Yes, cancel schedule" }).click();
    await page.getByText("Schedule cancelled. The item has returned to the Ready queue.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit post", exact: true }).click();
    await page.getByText("Ready state removed. The post is a draft again and its caption, hashtags, and media can be edited.", { exact: true }).waitFor();
    await expect(captionEditor.isEnabled()).resolves.toBe(true);
    await page.getByRole("button", { name: "Delete post draft" }).click();
    await expect(page.getByRole("dialog", { name: "Delete this post draft?" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Yes, delete draft" }).click();
    await page.getByText("Post draft deleted from MarkOS. Its media files remain in the workspace media library.", { exact: true }).waitFor();

    expect(generationPayload).toEqual({ contentType: "POST", count: 1, topic: "Launch our new Bahrain dessert subscription to busy professionals." });
    expect(updatePayload).toMatchObject({
      captionAr: "طقوس حلوة جديدة لفرق العمل في البحرين.",
      captionEn: "A fresh dessert ritual for busy Bahrain teams."
    });
    expect(uploadPayload).toMatchObject({ filename: "showcase.jpg", height: 1080, mimeType: "image/jpeg", type: "IMAGE", width: 1080 });
    expect(typeof uploadPayload?.base64Data).toBe("string");
    expect(imageGenerationPayload).toEqual({ aspectRatio: "4:5" });
    expect(statusTransitions).toEqual(["IN_REVIEW", "APPROVED", "DRAFT"]);
    expect(typeof schedulePayload?.scheduledAt).toBe("string");
    expect(unscheduleCalls).toBe(1);
    expect(deleteCalls).toBe(1);
    await page.close();
  });

  it("plans the week, schedules ready content, reschedules safely, and confirms cancellation", async () => {
    const page = await sessionPage();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const updatedAt = new Date().toISOString();
    const scheduledAt = updatedAt;
    const publishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ready = {
      ...studioContentRecord(),
      captionEn: "Ready campaign post for the dessert subscription.",
      id: "calendar-ready",
      plannedAt: updatedAt,
      status: "APPROVED",
      updatedAt
    };
    const scheduled = {
      ...studioContentRecord(),
      captionEn: "Product story scheduled for this week.",
      contentType: "REEL",
      id: "calendar-scheduled",
      plannedAt: updatedAt,
      scheduledAt,
      status: "SCHEDULED",
      updatedAt
    };
    const published = {
      ...studioContentRecord(),
      captionEn: "Published customer story.",
      id: "calendar-published",
      publishedAt,
      status: "PUBLISHED"
    };
    const draft = {
      ...studioContentRecord(),
      captionEn: "Draft founder story for review.",
      id: "calendar-draft",
      status: "DRAFT",
      updatedAt
    };
    const queuedDrafts = Array.from({ length: 12 }, (_, index) => ({
      ...studioContentRecord(),
      captionEn: `Queued draft ${String(index + 1).padStart(2, "0")} for later.`,
      id: `calendar-queued-${index + 1}`,
      status: "DRAFT",
      updatedAt: new Date(Date.now() - (index + 1) * 60_000).toISOString()
    }));
    let records = [scheduled, ready, published, draft, ...queuedDrafts];
    let schedulePayload: Record<string, unknown> | undefined;
    let reschedulePayload: Record<string, unknown> | undefined;
    let unscheduleCalls = 0;

    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();
      if (pathname === "/v1/calendar" && method === "GET") return route.fulfill(json(calendarReadResult(records, route.request().url())));
      if (pathname === `/v1/content/${ready.id}/schedule` && method === "POST") {
        schedulePayload = route.request().postDataJSON() as Record<string, unknown>;
        const updated = { ...ready, scheduledAt: schedulePayload.scheduledAt as string, status: "SCHEDULED" };
        records = records.map((record) => (record.id === updated.id ? updated : record));
        return route.fulfill(json(updated));
      }
      if (pathname === `/v1/content/${scheduled.id}/reschedule` && method === "POST") {
        reschedulePayload = route.request().postDataJSON() as Record<string, unknown>;
        const updated = { ...scheduled, scheduledAt: reschedulePayload.scheduledAt as string };
        records = records.map((record) => (record.id === updated.id ? updated : record));
        return route.fulfill(json(updated));
      }
      if (pathname === `/v1/content/${scheduled.id}/unschedule` && method === "POST") {
        unscheduleCalls += 1;
        const { plannedAt: _plannedAt, scheduledAt: _scheduledAt, ...withoutSchedule } = scheduled;
        const updated = { ...withoutSchedule, status: "APPROVED" };
        records = records.map((record) => (record.id === updated.id ? updated : record));
        return route.fulfill(json(updated));
      }

      return route.fulfill(json([]));
    });

    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto(`${baseUrl}/en/app/calendar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Content calendar" }).waitFor();
    await expect(page.getByRole("link", { name: "Calendar" }).getAttribute("aria-current")).resolves.toBe("page");

    const desktopSidebar = page.locator("[data-app-sidebar]");
    const desktopShell = page.locator("[data-sidebar-collapsed]");
    const expandedSidebarBox = await desktopSidebar.boundingBox();
    if (!expandedSidebarBox) throw new Error("Expected the desktop sidebar to be visible.");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-sidebar-collapsed]")?.dataset.sidebarCollapsed === "true" &&
        (document.querySelector<HTMLElement>("[data-app-sidebar]")?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY) < 90
    );
    await expect(desktopShell.getAttribute("data-sidebar-collapsed")).resolves.toBe("true");
    await expect(page.evaluate(() => localStorage.getItem("markos.sidebar.collapsed"))).resolves.toBe("true");
    const collapsedSidebarBox = await desktopSidebar.boundingBox();
    if (!collapsedSidebarBox) throw new Error("Expected the collapsed desktop sidebar to be visible.");
    expect(collapsedSidebarBox.width).toBeLessThan(expandedSidebarBox.width);

    const collapsedCalendarLink = page.getByRole("link", { name: "Calendar", exact: true });
    const expandSidebarButton = page.getByRole("button", { name: "Expand sidebar" });
    await expect(expandSidebarButton.evaluate((element) => document.activeElement === element)).resolves.toBe(true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(collapsedCalendarLink.evaluate((element) => document.activeElement === element)).resolves.toBe(true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector<HTMLElement>('[data-sidebar-tooltip="calendar"]')!).opacity === "1");
    await expect(collapsedCalendarLink.getAttribute("aria-current")).resolves.toBe("page");
    await expandSidebarButton.click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-sidebar-collapsed]")?.dataset.sidebarCollapsed === "false" &&
        (document.querySelector<HTMLElement>("[data-app-sidebar]")?.getBoundingClientRect().width ?? 0) > 180
    );
    await expect(page.evaluate(() => localStorage.getItem("markos.sidebar.collapsed"))).resolves.toBe("false");

    const firstDayControl = page.getByRole("button", { name: /^Open day:/ }).first();
    const desktopWeekDay = await firstDayControl.locator("xpath=ancestor::section[1]").boundingBox();
    expect(desktopWeekDay?.height).toBeGreaterThanOrEqual(350);
    expect((desktopWeekDay?.y ?? 0) + (desktopWeekDay?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 900);
    await expect(page.getByLabel("Language switcher").count()).resolves.toBe(0);

    const statusFilters = page.getByRole("group", { name: "Filter by content status" });
    await expect(statusFilters.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed")).resolves.toBe("true");
    await statusFilters.getByRole("button", { name: "Draft", exact: true }).click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("filter") === "draft");
    await expect(statusFilters.getByRole("button", { name: "Draft", exact: true }).getAttribute("aria-pressed")).resolves.toBe("true");
    await statusFilters.getByRole("button", { name: "All", exact: true }).click();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("filter"));

    await page.getByLabel("Content type").selectOption({ label: "Reel" });
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("type") === "REEL");
    await expect(page.getByRole("button", { name: /Product story scheduled/ }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: /Ready campaign post/ }).count()).resolves.toBe(0);
    await page.getByLabel("Content type").selectOption({ label: "All types" });
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("type"));

    const readyCounter = statusFilters.getByRole("button", { name: /Ready to schedule/ });
    await expect(readyCounter.getAttribute("aria-pressed")).resolves.toBe("false");
    await readyCounter.click();
    await expect(readyCounter.getAttribute("aria-pressed")).resolves.toBe("true");
    await readyCounter.click();
    const unscheduled = page.getByRole("button", { name: /Unscheduled · 13/ });
    await unscheduled.click();
    await expect(page.getByRole("link", { name: /Draft founder story/ }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "Load more" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Load more" }).click();
    await page.getByRole("link", { name: /Queued draft 12/ }).waitFor();
    await page.getByRole("button", { name: "Load more" }).waitFor({ state: "detached" });
    await unscheduled.click();

    const directReadyItem = page.getByRole("button", { name: /Ready: Ready campaign post/ });
    await directReadyItem.click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("item"));
    const focusSurface = page.locator('[data-calendar-motion="focus-surface"]');
    await expect(focusSurface.getAttribute("data-calendar-motion-kind")).resolves.toBe("calendar-to-record");
    await expect(
      focusSurface.evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.playState === "running"))
    ).resolves.toBe(true);
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    await expect(page.getByRole("button", { name: "Back to day" }).isVisible()).resolves.toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("day") && !new URL(window.location.href).searchParams.has("item"));
    await expect(focusSurface.getAttribute("data-calendar-motion-kind")).resolves.toBe("record-to-day");
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    expect(new URL(page.url()).searchParams.has("day")).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("day"));
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Ready: Ready campaign post"));
    await expect(directReadyItem.evaluate((element) => document.activeElement === element)).resolves.toBe(true);

    const readyDayColumn = directReadyItem.locator("xpath=ancestor::section[1]");
    const readyDayBox = await readyDayColumn.boundingBox();
    if (!readyDayBox) throw new Error("Expected the ready day surface to be visible.");
    await readyDayColumn.click({ position: { x: readyDayBox.width / 2, y: readyDayBox.height - 12 } });
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("day"));
    await expect(focusSurface.getAttribute("data-calendar-motion-kind")).resolves.toBe("calendar-to-day");
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    const dayUrl = new URL(page.url());
    expect(dayUrl.searchParams.get("day")).toBeTruthy();
    expect(dayUrl.searchParams.has("item")).toBe(false);
    const dayDialog = page.getByRole("dialog", { name: /2026/ });
    await expect(dayDialog.evaluate((element) => document.activeElement === element)).resolves.toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(
      dayDialog.evaluate((element) => {
        const focusable = Array.from(
          element.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((candidate) => candidate.getClientRects().length > 0 && candidate.getAttribute("aria-hidden") !== "true");
        return document.activeElement === focusable.at(-1);
      })
    ).resolves.toBe(true);
    await page.keyboard.press("Tab");
    await expect(dayDialog.getByRole("button", { name: "Back to calendar" }).evaluate((element) => document.activeElement === element)).resolves.toBe(true);
    await dayDialog.getByRole("button", { name: /Ready campaign post/ }).click();
    await expect(page.getByRole("button", { name: "Back to day" }).isVisible()).resolves.toBe(true);
    await expect(focusSurface.getAttribute("data-calendar-motion-kind")).resolves.toBe("day-to-record");
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    await expect(page.locator('button[aria-current="true"]').getByText("Ready campaign post...", { exact: true }).isVisible()).resolves.toBe(true);
    expect(new URL(page.url()).searchParams.get("item")).toBe(ready.id);

    const dayContext = page.locator('[data-calendar-motion-part="day-context"]');
    await expect(
      dayContext.locator("[data-calendar-status]").evaluateAll((rows) => new Set(rows.map((row) => getComputedStyle(row).backgroundColor)).size)
    ).resolves.toBeGreaterThan(1);
    const originalDayContext = await dayContext.elementHandle();
    if (!originalDayContext) throw new Error("Expected the persistent day context to be mounted.");
    const alternatePost = dayContext.getByRole("button", { name: /Product story scheduled/ });
    await alternatePost.click();
    await expect(focusSurface.getAttribute("data-calendar-motion-kind")).resolves.toBe("record-switch");
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    await expect(
      originalDayContext.evaluate((element) => element.isSameNode(document.querySelector('[data-calendar-motion-part="day-context"]')))
    ).resolves.toBe(true);
    await dayContext.getByRole("button", { name: /Ready campaign post/ }).click();
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    expect(new URL(page.url()).searchParams.get("item")).toBe(ready.id);

    await page.goBack();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("item"));
    await expect(page.getByRole("button", { name: "Back to calendar" }).isVisible()).resolves.toBe(true);
    await page.goForward();
    await page.getByRole("button", { name: "Back to day" }).waitFor();
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");

    const readyScheduleInput = bahrainInputDaysFromNow(1, 18, 0);
    await focusSurface.getByLabel("Choose publishing time").fill(readyScheduleInput);
    await focusSurface.getByRole("button", { name: "Schedule content" }).click();
    await page.getByText(/^Saved in MARKOS for /).waitFor();

    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("day") && !new URL(window.location.href).searchParams.has("item"));
    await focusSurface.waitFor({ state: "detached" });
    const scheduledCounter = statusFilters.getByRole("button", { name: /Scheduled in MARKOS/ });
    await scheduledCounter.click();
    await expect(scheduledCounter.getAttribute("aria-pressed")).resolves.toBe("true");
    await page.getByRole("button", { name: /Scheduled in MARKOS: Product story scheduled/ }).click();
    await page.getByRole("button", { name: "Back to day" }).waitFor();
    const rescheduleInput = bahrainInputDaysFromNow(2, 19, 30);
    await page.getByLabel("Choose a new time").fill(rescheduleInput);
    await page.getByRole("button", { name: "Save new time" }).click();
    await page.getByText(/^Saved in MARKOS for /).waitFor();
    const cancelScheduleButton = page.getByRole("button", { name: "Cancel schedule" });
    await cancelScheduleButton.click();
    const dialog = page.getByRole("dialog", { name: "Cancel this content schedule?" });
    await expect(dialog.isVisible()).resolves.toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog.isVisible()).resolves.toBe(false);
    await expect.poll(() => cancelScheduleButton.evaluate((element) => document.activeElement === element)).toBe(true);
    await cancelScheduleButton.click();
    await dialog.getByRole("button", { name: "Cancel schedule" }).click();
    const cancellationNotice = page.getByText("Schedule cancelled. The post is Ready and has moved to Unscheduled.", { exact: true });
    await cancellationNotice.waitFor();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("day") && !new URL(window.location.href).searchParams.has("item"));
    await expect(page.getByRole("button", { name: "Back to calendar" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Back to calendar" }).click();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("day"));
    await focusSurface.waitFor({ state: "detached" });
    await expect(scheduledCounter.getAttribute("aria-pressed")).resolves.toBe("false");
    const movedToUnscheduled = page.getByRole("button", { name: /Unscheduled · 14/ });
    await expect(movedToUnscheduled.getAttribute("aria-expanded")).resolves.toBe("true");
    await expect(page.getByRole("link", { name: /Product story scheduled/ }).isVisible()).resolves.toBe(true);
    await cancellationNotice.waitFor({ state: "hidden", timeout: 6_000 });

    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByRole("button", { name: "Month", exact: true }).getAttribute("aria-pressed")).resolves.toBe("true");
    await expect(statusFilters.locator("[data-calendar-status]").count()).resolves.toBe(5);
    await expect(page.getByLabel("Month calendar").getByText("Product story scheduled...", { exact: true }).count()).resolves.toBe(0);
    const monthCalendar = await page.getByLabel("Month calendar").boundingBox();
    if (!monthCalendar) throw new Error("Expected the Month calendar to be visible.");
    expect(monthCalendar.y + monthCalendar.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? 900);
    await page.screenshot({ path: "evidence/sunlit-calendar.png", fullPage: true });

    await page.setViewportSize({ height: 768, width: 1366 });
    await page.goto(`${baseUrl}/ar/app/calendar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "تقويم المحتوى" }).waitFor();
    await expect(page.locator("main").getAttribute("dir")).resolves.toBe("rtl");
    await expect(page.getByRole("link", { name: "التقويم" }).getAttribute("aria-current")).resolves.toBe("page");
    await expect(page.getByRole("group", { name: "تصفية حالة المحتوى" }).isVisible()).resolves.toBe(true);
    await expect(page.getByLabel("نوع المحتوى").isVisible()).resolves.toBe(true);
    await expect(page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).resolves.toBe(false);

    await page.getByRole("button", { name: "طي الشريط الجانبي" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-sidebar-collapsed]")?.dataset.sidebarCollapsed === "true" &&
        (document.querySelector<HTMLElement>("[data-app-sidebar]")?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY) < 90
    );
    const rtlSidebarGeometry = await desktopSidebar.evaluate((element) => {
      const sidebar = element.getBoundingClientRect();
      const activeLink = element.querySelector<HTMLElement>('[aria-current="page"]');
      const activeAccentStyle = activeLink ? getComputedStyle(activeLink, "::before") : null;
      return {
        activeAccentLeft: Number.parseFloat(activeAccentStyle?.left ?? "0"),
        activeAccentRight: Number.parseFloat(activeAccentStyle?.right ?? "0"),
        activeAccentWidth: Number.parseFloat(activeAccentStyle?.width ?? "0"),
        right: sidebar.right,
        viewportWidth: window.innerWidth
      };
    });
    expect(Math.abs(rtlSidebarGeometry.viewportWidth - rtlSidebarGeometry.right)).toBeLessThan(1);
    expect(rtlSidebarGeometry.activeAccentRight).toBeLessThan(rtlSidebarGeometry.activeAccentLeft);
    expect(rtlSidebarGeometry.activeAccentWidth).toBeGreaterThanOrEqual(3);
    await page.getByRole("button", { name: "توسيع الشريط الجانبي" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-sidebar-collapsed]")?.dataset.sidebarCollapsed === "false" &&
        (document.querySelector<HTMLElement>("[data-app-sidebar]")?.getBoundingClientRect().width ?? 0) > 180
    );
    await page.screenshot({ path: "evidence/sunlit-calendar-rtl-desktop.png", fullPage: true });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${baseUrl}/en/app/calendar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Content calendar" }).waitFor();
    await page
      .getByRole("button", { name: /^Open day:/ })
      .first()
      .click();
    await page.locator('[data-calendar-layer="day"]').waitFor();
    await expect(focusSurface.getAttribute("data-calendar-motion-state")).resolves.toBe("reduced");
    await expect(
      page
        .locator('[data-calendar-layer="day"]')
        .evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running" || animation.pending).length)
    ).resolves.toBe(0);
    await page.keyboard.press("Escape");
    await page.locator('[data-calendar-layer="overview"]').waitFor();
    await page.emulateMedia({ reducedMotion: "no-preference" });

    expect(schedulePayload).toEqual({ scheduledAt: new Date(`${readyScheduleInput}:00+03:00`).toISOString() });
    expect(reschedulePayload).toEqual({ scheduledAt: new Date(`${rescheduleInput}:00+03:00`).toISOString() });
    expect(unscheduleCalls).toBe(1);
    await page.close();
  }, 60_000);
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

function approvedOnboardingState(updatedAt: string) {
  const modules = ["company", "story", "products", "audience", "competitors", "brand", "objectives"].map((module) => ({
    completed: true,
    module,
    sections: module === "brand" ? ["TONE"] : [module.toUpperCase()],
    skipped: false
  }));

  return {
    businessProfile: { interactionId: "profile-1", profile: null, status: "APPROVED", updatedAt },
    modules,
    onboardingScore: 100,
    readyForProfile: true,
    status: "COMPLETE",
    vaultScore: {
      completedSections,
      entryCount: completedSections.length,
      missingSections: [],
      requiredSections: completedSections,
      score: 100
    }
  };
}

function emptyOnboardingState() {
  const sections = ["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "TONE", "OBJECTIVES"];
  const modules = ["company", "story", "products", "audience", "competitors", "brand", "objectives"].map((module, index) => ({
    completed: false,
    module,
    sections: [sections[index]],
    skipped: false
  }));
  return {
    businessProfile: { interactionId: null, profile: null, status: "MISSING", updatedAt: null },
    modules,
    onboardingScore: 0,
    readyForProfile: false,
    status: "NOT_STARTED",
    vaultScore: { completedSections: [], entryCount: 0, missingSections: completedSections, requiredSections: completedSections, score: 0 }
  };
}

function onboardingDocumentAnalysis() {
  return {
    id: "01a05c25-3efd-7ed2-bdcf-5de2e04be57e",
    workspaceId: session.workspace.id,
    status: "READY",
    files: [{ id: "file-1", filename: "brand.txt", mimeType: "text/plain", sizeBytes: 32, removed: false }],
    result: {
      profile: {
        company: { name: "SnackLab", industry: "Food and beverage", socials: [], languages: [] },
        offerings: {
          items: [{ kind: "PRODUCT", name: "Protein bites", currency: "BHD", confidence: "HIGH", sourceFiles: ["brand.txt"] }],
          differentiators: [],
          salesChannels: []
        },
        story: { values: [] },
        audience: { interests: [], locations: [], motivations: [], painPoints: [] },
        competitors: { items: [] },
        brand: { aestheticWords: [], colors: ["#2B59FF", "#F97316"], fonts: [], toneWords: ["clear"] },
        objectives: { goals: [] }
      },
      evidence: [{ field: "brand.colors", sourceFiles: ["brand.txt"], confidence: "MEDIUM", basis: "VISUAL_INFERENCE" }],
      issues: [{ code: "VISUAL_INFERENCE", severity: "INFO", message: "Confirm the inferred brand colors.", field: "brand.colors", sourceFiles: ["brand.txt"] }]
    },
    expiresAt: "2026-09-02T08:00:00.000Z",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  };
}

function calendarReadResult(records: Array<Record<string, unknown>>, requestUrl: string) {
  const search = new URL(requestUrl).searchParams;
  const from = search.get("from") ?? "0000-01-01";
  const to = search.get("to") ?? "9999-12-31";
  const statuses = new Set((search.get("statuses") ?? "").split(",").filter(Boolean));
  const contentTypes = new Set((search.get("contentTypes") ?? "").split(",").filter(Boolean));
  const offset = Number(search.get("unscheduledOffset") ?? 0);
  const limit = Number(search.get("unscheduledLimit") ?? 12);
  const matchesType = (record: Record<string, unknown>) => contentTypes.size === 0 || contentTypes.has(String(record.contentType));
  const matchesStatus = (record: Record<string, unknown>) => statuses.size === 0 || statuses.has(String(record.status));
  const filtered = records.filter((record) => matchesType(record) && matchesStatus(record));
  const placement = (record: Record<string, unknown>) => {
    if (record.status === "PUBLISHED") return record.publishedAt;
    if (record.status === "SCHEDULED" || record.status === "FAILED") return record.scheduledAt;
    return record.plannedAt;
  };
  const items = filtered.filter((record) => {
    const value = placement(record);
    if (typeof value !== "string") return false;
    const dateKey = value.slice(0, 10);
    return dateKey >= from && dateKey <= to;
  });
  const unscheduled = filtered
    .filter((record) => ["DRAFT", "IN_REVIEW", "APPROVED"].includes(String(record.status)) && typeof record.plannedAt !== "string")
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  const page = unscheduled.slice(offset, offset + limit);
  const summaryRecords = records.filter(matchesType);
  const nextOffset = offset + page.length;

  return {
    range: { from, to },
    items,
    mediaAssets: [],
    summary: {
      scheduledThisWeek: summaryRecords.filter((record) => record.status === "SCHEDULED").length,
      ready: summaryRecords.filter((record) => record.status === "APPROVED").length,
      needsAttention: summaryRecords.filter((record) => record.status === "FAILED").length
    },
    unscheduled: {
      items: page,
      total: unscheduled.length,
      ...(nextOffset < unscheduled.length ? { nextOffset } : {})
    }
  };
}

function snackLabVault() {
  const entry = (section: string, key: string, value: Record<string, unknown>) => [
    {
      createdAt: "2026-08-09T11:30:00.000Z",
      id: `${section}-${key}`,
      key,
      section,
      updatedAt: "2026-08-09T11:30:00.000Z",
      value,
      version: 1,
      workspaceId: session.workspace.id
    }
  ];

  return {
    AUDIENCE: entry("AUDIENCE", "primary-audience", {
      demographics: "Bahrain dessert lovers",
      interests: ["baking", "desserts"],
      locations: ["Manama"],
      painPoints: ["Finding reliable dessert kits"]
    }),
    BRAND: entry("BRAND", "identity", { aestheticWords: ["warm", "playful"], colors: ["#EA6A32"], fonts: ["Inter"] }),
    COMPANY: entry("COMPANY", "profile", {
      industry: "Food & Beverage",
      languages: ["Arabic", "English"],
      location: "Manama, Bahrain",
      name: "SnackLab"
    }),
    COMPETITORS: entry("COMPETITORS", "competitors", { items: [{ name: "Bahrain Bake House" }] }),
    OBJECTIVES: entry("OBJECTIVES", "goals", { goals: ["Increase brand awareness"] }),
    PRODUCTS: entry("PRODUCTS", "catalog", { items: [{ category: "Dessert kits", name: "Experiment Box" }] }),
    STORY: entry("STORY", "story", {
      mission: "Make dessert experimentation easy and playful.",
      usp: "Small-batch guided baking kits.",
      values: ["curiosity", "quality"]
    }),
    TONE: entry("TONE", "voice", { toneWords: ["playful"] })
  };
}

function snackLabCampaign() {
  return {
    content: {
      durationDays: 30,
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
      publishesPerDay: 1,
      summary: "A Vault-grounded 30-day Instagram campaign for SnackLab.",
      weeklyCadence: [{ actions: ["Publish one Reel", "Publish one carousel"], focus: "Launch consistency", week: 1 }]
    },
    createdAt: "2026-08-09T11:35:00.000Z",
    durationDays: 30,
    endsAt: "2026-09-08T11:35:00.000Z",
    id: "campaign-snacklab-30",
    publishesPerDay: 1,
    startsAt: "2026-08-09T11:35:00.000Z",
    status: "REVIEW",
    title: "SnackLab 30-Day Instagram Campaign",
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

function bahrainInputDaysFromNow(days: number, hour: number, minute: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bahrain",
    year: "numeric"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const onePixelJpegBase64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";
const onePixelJpegDataUrl = `data:image/jpeg;base64,${onePixelJpegBase64}`;

function json(data: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data }) };
}
