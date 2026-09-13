import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CampaignRecord } from "@markos/shared-types";

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
    await expect.poll(() => page.getByRole("region", { name: "Selected files" }).getByText("brand", { exact: true }).isVisible()).toBe(true);
    await expect.poll(() => page.getByRole("region", { name: "Selected files" }).getByText("offerings", { exact: true }).isVisible()).toBe(true);
    await expect.poll(() => page.getByRole("region", { name: "Selected files" }).getByText("2/5", { exact: true }).isVisible()).toBe(true);
    await page.screenshot({ path: "evidence/sunlit-onboarding-document-selection.png", fullPage: true });
    expect(documentAnalysisPosts).toBe(0);
    await page.getByRole("button", { name: "Analyze files" }).click();
    await page.getByRole("heading", { name: "Review what MARKOS will know" }).waitFor();
    expect(documentAnalysisFileCount).toBe(2);
    expect(documentAnalysisPosts).toBe(1);
    expect(moduleWrites).toBe(0);
    await expect.poll(() => page.getByText("Information found in your files").isVisible()).toBe(true);

    await page.getByRole("button", { name: /^Tone of voice/ }).click();
    await page.getByRole("heading", { name: "How should the business sound?" }).waitFor();
    await expect(page.locator('input[type="color"]').count()).resolves.toBe(3);
    await expect.poll(() => page.getByRole("code").filter({ hasText: "#2B59FF" }).isVisible()).toBe(true);
    await expect.poll(() => page.getByRole("code").filter({ hasText: "#F97316" }).isVisible()).toBe(true);
    await page.getByLabel("Choose color").fill("#123456");
    await expect(page.locator('input[type="color"]').count()).resolves.toBe(3);
    await page.screenshot({ path: "evidence/sunlit-onboarding-color-selection.png", fullPage: true });
    await page.getByRole("button", { name: "Add selected color" }).click();
    await expect(page.locator('input[type="color"]').count()).resolves.toBe(4);
    await expect.poll(() => page.getByRole("code").filter({ hasText: "#123456" }).isVisible()).toBe(true);
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
    await expect.poll(() => page.getByText("100%", { exact: true }).isVisible()).toBe(true);
    const competitors = page.locator("article").filter({ has: page.getByRole("heading", { name: "Competitors", exact: true }) });
    await expect.poll(() => competitors.getByText("Complete", { exact: true }).isVisible()).toBe(true);
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
    await expect.poll(() => backGuard.isVisible()).toBe(true);
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

  it("selects among Campaigns, generates a new plan, and reviews only one detailed week at a time", async () => {
    const page = await sessionPage();
    let failRefresh = false;
    let failGeneration = true;
    let releaseGeneration = () => {};
    const generationHold = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    let generationPayload: Record<string, unknown> | undefined;
    let suggestionApprovalPayload: Record<string, unknown> | undefined;
    let approvedSuggestionDraft: ReturnType<typeof campaignSuggestionDraft> | undefined;
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/campaigns/summaries" && route.request().method() === "GET") {
        if (failRefresh)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Campaign refresh is unavailable. Try again." } })
          });
        return route.fulfill(
          json({ items: [campaignSummaryFixture(snackLabCampaign()), campaignSummaryFixture(snackLabCommunitySprint())], nextCursor: null })
        );
      }
      if (pathname === "/v1/campaigns/generate" && route.request().method() === "POST") {
        generationPayload = route.request().postDataJSON() as Record<string, unknown>;
        await generationHold;
        if (failGeneration)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Campaign generation is unavailable. Try again." } })
          });
        return route.fulfill(json({ ...snackLabCampaign(), id: "campaign-snacklab-generated" }));
      }
      if (pathname.endsWith("/review") && pathname.startsWith("/v1/campaigns/")) {
        if (failRefresh)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Campaign refresh is unavailable. Try again." } })
          });
        const id = pathname.split("/")[3]!;
        const campaign = id === "campaign-snacklab-community" ? snackLabCommunitySprint() : { ...snackLabCampaign(), id };
        return route.fulfill(json({ campaign, items: approvedSuggestionDraft ? [approvedSuggestionDraft] : [], mediaAssets: [] }));
      }
      if (pathname.endsWith("/drafts") && pathname.startsWith("/v1/campaigns/")) {
        return route.fulfill(json(approvedSuggestionDraft ? [approvedSuggestionDraft] : []));
      }
      if (pathname.endsWith("/suggestions/approve") && route.request().method() === "POST") {
        suggestionApprovalPayload = route.request().postDataJSON() as Record<string, unknown>;
        approvedSuggestionDraft = campaignSuggestionDraft("campaign-snacklab-generated");
        return route.fulfill(json(approvedSuggestionDraft));
      }
      if (pathname === "/v1/content") return route.fulfill(json(approvedSuggestionDraft ? [approvedSuggestionDraft] : []));
      if (approvedSuggestionDraft && pathname === `/v1/content/${approvedSuggestionDraft.id}/conversation`)
        return route.fulfill(json({ id: null, contentItem: approvedSuggestionDraft, messages: [], latestRun: null }));
      if (pathname === "/v1/media") return route.fulfill(json([]));
      if (pathname === "/v1/calendar") {
        return route.fulfill(
          json({
            range: { from: "2026-09-01", to: "2026-09-30" },
            items: [],
            mediaAssets: [],
            summary: { scheduledThisWeek: 0, ready: 0, needsAttention: 0 },
            unscheduled: { items: approvedSuggestionDraft ? [approvedSuggestionDraft] : [], total: approvedSuggestionDraft ? 1 : 0 }
          })
        );
      }

      return route.fulfill(json([]));
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/en/app/campaigns?campaign=campaign-snacklab-community`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Campaigns", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: "Campaigns" }).getAttribute("aria-current")).resolves.toBe("page");
    const reviewer = page.getByRole("dialog", { name: "SnackLab 7-Day Community Sprint", exact: true });
    await reviewer.waitFor();
    await reviewer.getByRole("button", { name: "Close campaign", exact: true }).click();
    await page.getByRole("button", { name: "Open campaign: SnackLab 14-Day Instagram Campaign", exact: true }).click();
    await page.getByRole("dialog", { name: "SnackLab 14-Day Instagram Campaign", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close campaign", exact: true }).click();
    await page.getByRole("button", { name: "New campaign" }).click();
    const composer = page.getByRole("dialog", { name: "Create a campaign", exact: true });
    await composer.waitFor();
    expect(await composer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await composer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(composer.getByRole("button", { name: "14 days", exact: true }).getAttribute("aria-pressed")).resolves.toBe("true");
    for (const duration of [30, 60, 90]) {
      await expect(composer.getByRole("button", { name: new RegExp(`^${duration} days`) }).isDisabled()).resolves.toBe(true);
    }
    await expect(page.getByText(/Zain Arabia/).count()).resolves.toBe(0);

    await composer.getByRole("button", { name: "Create campaign", exact: true }).click();
    await expect.poll(() => composer.getByRole("button", { name: "Close campaign composer" }).isDisabled()).toBe(true);
    await page.keyboard.press("Escape");
    expect(await composer.isVisible()).toBe(true);
    releaseGeneration();
    await composer.getByRole("alert").filter({ hasText: "Campaign generation is unavailable. Try again." }).waitFor();
    expect(await composer.getByLabel("Campaign objective").inputValue()).toBe("Increase qualified Instagram inquiries");
    failGeneration = false;
    await composer.getByRole("button", { name: "Create campaign", exact: true }).click();
    const generatedReview = page.getByRole("dialog", { name: "SnackLab 14-Day Instagram Campaign", exact: true });
    await generatedReview.waitFor();
    await expect(page.getByRole("button", { name: "Export" }).count()).resolves.toBe(0);
    await generatedReview.getByRole("button", { name: "Overview", exact: true }).last().click();
    await generatedReview.getByText("Priority actions", { exact: true }).click();
    await expect.poll(() => generatedReview.getByText("Create the first weekly content batch", { exact: true }).isVisible()).toBe(true);
    await generatedReview.getByRole("button", { name: "Week", exact: true }).click();
    await expect.poll(() => generatedReview.getByText("Publish origin story Reel", { exact: true }).isVisible()).toBe(true);
    const nextWeek = generatedReview.getByRole("button", { name: "Next week", exact: true });
    const previousPosition = await nextWeek.boundingBox();
    await nextWeek.click();
    expect(await nextWeek.boundingBox()).toEqual(previousPosition);
    await expect.poll(() => generatedReview.getByText("Publish customer taste-test Reel", { exact: true }).isVisible()).toBe(true);
    await expect(nextWeek.isDisabled()).resolves.toBe(true);
    await generatedReview.getByRole("button", { name: /Publish customer taste-test Reel/ }).click();
    await generatedReview.getByRole("button", { name: "Month", exact: true }).click();
    await generatedReview.getByRole("button", { name: /16 August,/ }).click();
    await generatedReview.getByRole("button", { name: /Publish customer taste-test Reel/ }).click();
    expect(generationPayload).toMatchObject({
      durationDays: 14,
      locale: "en",
      objective: "Increase qualified Instagram inquiries",
      publishesPerDay: 1,
      startsAt: expect.any(String)
    });

    failRefresh = true;
    await generatedReview.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Campaign refresh is unavailable. Try again." }).waitFor();
    expect(await composer.count()).toBe(0);
    failRefresh = false;
    await generatedReview.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.poll(() => generatedReview.getByRole("alert").count()).toBe(0);

    await generatedReview.getByRole("button", { name: "Create draft: Publish customer taste-test Reel", exact: true }).click();
    await expect.poll(() => suggestionApprovalPayload).toEqual({ week: 2, actionIndex: 0 });
    await page.waitForURL(`${baseUrl}/en/app/content-studio?item=${approvedSuggestionDraft!.id}&source=campaign`);
    await page.getByRole("region", { name: "Post workspace", exact: true }).waitFor();
    expect(await page.locator(".studio-instagram").count()).toBe(0);
    const campaignLink = page.getByRole("link", { name: /^Campaign ↗$/ });
    await campaignLink.waitFor();
    await expect(campaignLink.getAttribute("href")).resolves.toBe("/en/app/campaigns?campaign=campaign-snacklab-generated");

    await page.goto(`${baseUrl}/en/app/calendar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Content calendar", exact: true }).waitFor();
    await page.getByRole("button", { name: /Unscheduled/ }).click();
    await expect.poll(() => page.getByText("Publish customer taste-test Reel", { exact: true }).isVisible()).toBe(true);
    await expect.poll(() => page.getByText("Campaign · Week 2", { exact: true }).isVisible()).toBe(true);
    await page.close();
  }, 60_000);

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
    await page.getByRole("heading", { name: "How can MARKOS help?" }).waitFor();
    await expect.poll(() => page.getByRole("button", { name: "Edit caption", exact: true }).isVisible()).toBe(true);
    await expect.poll(() => page.getByLabel("Message MARKOS", { exact: true }).isVisible()).toBe(true);
    await page.screenshot({ path: "evidence/sunlit-create.png", fullPage: true });

    await page.goto(`${baseUrl}/en/app/analytics`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Insights", exact: true }).waitFor();
    await page.getByText("No synced insights yet", { exact: true }).waitFor();
    await expect(page.getByText("Live", { exact: true }).count()).resolves.toBe(0);
    await page.screenshot({ path: "evidence/sunlit-insights.png", fullPage: true });

    await page.goto(`${baseUrl}/en/app/knowledge`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Business Profile", exact: true }).waitFor();
    await expect(page.getByRole("link", { name: /Review and edit profile/ }).getAttribute("href")).resolves.toBe("/en/onboarding?mode=edit");
    await page.screenshot({ path: "evidence/sunlit-business-profile.png", fullPage: true });
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
      caption: "Ready campaign post for the dessert subscription.",
      id: "calendar-ready",
      plannedAt: updatedAt,
      status: "APPROVED",
      updatedAt
    };
    const scheduled = {
      ...studioContentRecord(),
      caption: "Product story scheduled for this week.",
      contentType: "REEL",
      id: "calendar-scheduled",
      mediaIds: ["calendar-video"],
      plannedAt: updatedAt,
      scheduledAt,
      status: "SCHEDULED",
      updatedAt
    };
    const published = {
      ...studioContentRecord(),
      caption: "Published customer story.",
      id: "calendar-published",
      publishedAt,
      status: "PUBLISHED"
    };
    const draft = {
      ...studioContentRecord(),
      caption: "Draft founder story for review.",
      id: "calendar-draft",
      status: "DRAFT",
      updatedAt
    };
    const queuedDrafts = Array.from({ length: 12 }, (_, index) => ({
      ...studioContentRecord(),
      caption: `Queued draft ${String(index + 1).padStart(2, "0")} for later.`,
      id: `calendar-queued-${index + 1}`,
      status: "DRAFT",
      updatedAt: new Date(Date.now() - (index + 1) * 60_000).toISOString()
    }));
    let records = [scheduled, ready, published, draft, ...queuedDrafts];
    const video = {
      id: "calendar-video",
      workspaceId: session.workspace.id,
      type: "VIDEO",
      mimeType: "video/webm",
      filename: "calendar-video.webm",
      publicUrl: "https://media.markos.test/calendar-video.webm",
      sizeBytes: 0,
      createdAt: updatedAt,
      updatedAt
    };
    await page.route(video.publicUrl, (route) => route.fulfill({ status: 200, contentType: "video/webm", body: "" }));
    let schedulePayload: Record<string, unknown> | undefined;
    let reschedulePayload: Record<string, unknown> | undefined;
    let unscheduleCalls = 0;
    let unscheduledPageAttempts = 0;

    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();
      if (pathname === "/v1/calendar" && method === "GET") {
        if (Number(new URL(route.request().url()).searchParams.get("unscheduledOffset")) > 0 && ++unscheduledPageAttempts === 1)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "More unscheduled posts could not be loaded. Try again." } })
          });
        return route.fulfill(json({ ...calendarReadResult(records, route.request().url()), mediaAssets: [video] }));
      }
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
        (document.querySelector<HTMLElement>("[data-app-sidebar]")?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY) < 120
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
    await expect.poll(() => page.getByRole("button", { name: /Product story scheduled/ }).isVisible()).toBe(true);
    await expect(page.getByRole("button", { name: /Ready campaign post/ }).count()).resolves.toBe(0);
    await page.getByLabel("Content type").selectOption({ label: "All types" });
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("type"));

    const readyCounter = statusFilters.getByRole("button", { name: /Ready/ });
    await expect(readyCounter.getAttribute("aria-pressed")).resolves.toBe("false");
    await readyCounter.click();
    await expect(readyCounter.getAttribute("aria-pressed")).resolves.toBe("true");
    await readyCounter.click();
    const unscheduled = page.getByRole("button", { name: /Unscheduled · 13/ });
    await unscheduled.click();
    await expect.poll(() => page.getByRole("link", { name: /Draft founder story/ }).isVisible()).toBe(true);
    await expect.poll(() => page.getByRole("button", { name: "Load more" }).isVisible()).toBe(true);
    await page.getByRole("button", { name: "Load more" }).click();
    const openBucket = page.getByRole("dialog", { name: /Unscheduled · 13/ });
    await openBucket.getByRole("alert").waitFor();
    await expect(openBucket.getByRole("alert").innerText()).resolves.toContain("More unscheduled posts could not be loaded");
    await expect(openBucket.getByRole("link", { name: /Draft founder story/ }).isVisible()).resolves.toBe(true);
    expect(new URL(page.url()).searchParams.has("day")).toBe(false);
    await openBucket.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("link", { name: /Queued draft 12/ }).waitFor();
    await expect(openBucket.getByRole("alert").count()).resolves.toBe(0);
    await page.getByRole("button", { name: "Load more" }).waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: /Unscheduled · 13/ }).waitFor({ state: "detached" });

    const directReadyItem = page.getByRole("button", { name: /Ready: Ready campaign post/ });
    await directReadyItem.click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("item"));
    const focusSurface = page.locator('[data-calendar-motion="focus-surface"]');
    await expect.poll(() => focusSurface.getAttribute("data-calendar-motion-kind")).toBe("calendar-to-record");
    await expect(
      focusSurface.evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.playState === "running"))
    ).resolves.toBe(true);
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    await expect.poll(() => page.getByRole("button", { name: "Back to day" }).isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("day") && !new URL(window.location.href).searchParams.has("item"));
    await expect.poll(() => focusSurface.getAttribute("data-calendar-motion-kind")).toBe("record-to-day");
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
    await expect.poll(() => focusSurface.getAttribute("data-calendar-motion-kind")).toBe("calendar-to-day");
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
    await expect.poll(() => page.getByRole("button", { name: "Back to day" }).isVisible()).toBe(true);
    await expect.poll(() => focusSurface.getAttribute("data-calendar-motion-kind")).toBe("day-to-record");
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    await expect
      .poll(() => page.locator('button[aria-current="true"]').getByText("Ready campaign post for the dessert subscription", { exact: true }).isVisible())
      .toBe(true);
    expect(new URL(page.url()).searchParams.get("item")).toBe(ready.id);

    const dayContext = page.locator('[data-calendar-motion-part="day-context"]');
    await expect(
      dayContext.locator("[data-calendar-status]").evaluateAll((rows) => new Set(rows.map((row) => getComputedStyle(row).backgroundColor)).size)
    ).resolves.toBeGreaterThan(1);
    const originalDayContext = await dayContext.elementHandle();
    if (!originalDayContext) throw new Error("Expected the persistent day context to be mounted.");
    const alternatePost = dayContext.getByRole("button", { name: /Product story scheduled/ });
    await alternatePost.click();
    await focusSurface.locator("video").waitFor();
    await expect(focusSurface.locator("video").getAttribute("src")).resolves.toBe(video.publicUrl);
    await expect(focusSurface.locator("video").evaluate((element) => (element as HTMLVideoElement).controls)).resolves.toBe(true);
    await expect(focusSurface.locator('img[src="' + video.publicUrl + '"]').count()).resolves.toBe(0);
    await expect.poll(() => focusSurface.getAttribute("data-calendar-motion-kind")).toBe("record-switch");
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    await expect(
      originalDayContext.evaluate((element) => element.isSameNode(document.querySelector('[data-calendar-motion-part="day-context"]')))
    ).resolves.toBe(true);
    await dayContext.getByRole("button", { name: /Ready campaign post/ }).click();
    await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-calendar-motion="focus-surface"]')?.dataset.calendarMotionState === "settled");
    expect(new URL(page.url()).searchParams.get("item")).toBe(ready.id);

    await page.goBack();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("item"));
    await expect.poll(() => page.getByRole("button", { name: "Back to calendar" }).isVisible()).toBe(true);
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
    const scheduledCounter = statusFilters.getByRole("button", { name: /Scheduled/ });
    await scheduledCounter.click();
    await expect(scheduledCounter.getAttribute("aria-pressed")).resolves.toBe("true");
    await page.getByRole("button", { name: /Scheduled: Product story scheduled/ }).click();
    await page.getByRole("button", { name: "Back to day" }).waitFor();
    const rescheduleInput = bahrainInputDaysFromNow(2, 19, 30);
    await page.getByLabel("Choose a new time").fill(rescheduleInput);
    await page.getByRole("button", { name: "Save new time" }).click();
    await page.getByText(/^Saved in MARKOS for /).waitFor();
    const cancelScheduleButton = page.getByRole("button", { name: "Cancel schedule" });
    await cancelScheduleButton.click();
    const dialog = page.getByRole("dialog", { name: "Cancel this content schedule?" });
    await expect.poll(() => dialog.isVisible()).toBe(true);
    await expect(dialog.getByText(/Its planned date and publishing time will be cleared/).count()).resolves.toBe(1);
    await page.keyboard.press("Escape");
    await expect.poll(() => dialog.isVisible()).toBe(false);
    await expect.poll(() => cancelScheduleButton.evaluate((element) => document.activeElement === element)).toBe(true);
    await cancelScheduleButton.click();
    await dialog.getByRole("button", { name: "Cancel schedule" }).click();
    const cancellationNotice = page.getByText("Schedule cancelled. The post is Ready and has moved to Unscheduled.", { exact: true });
    await cancellationNotice.waitFor();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("day") && !new URL(window.location.href).searchParams.has("item"));
    await expect.poll(() => page.getByRole("button", { name: "Back to calendar" }).isVisible()).toBe(true);
    const unscheduledDrawer = page.getByRole("dialog", { name: /Unscheduled · 14/ });
    await unscheduledDrawer.waitFor();
    await expect.poll(() => unscheduledDrawer.getByRole("link", { name: /Product story scheduled/ }).isVisible()).toBe(true);
    await cancellationNotice.waitFor({ state: "hidden", timeout: 6_000 });
    await expect(unscheduledDrawer.evaluate((element) => element.matches(":modal") && element.contains(document.activeElement))).resolves.toBe(true);
    await page.keyboard.press("Escape");
    await unscheduledDrawer.waitFor({ state: "detached" });
    expect(new URL(page.url()).searchParams.has("day")).toBe(true);
    await expect(focusSurface.evaluate((element) => element.contains(document.activeElement))).resolves.toBe(true);
    await page.getByRole("button", { name: "Back to calendar" }).click();
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("day"));
    await focusSurface.waitFor({ state: "detached" });
    await expect(scheduledCounter.getAttribute("aria-pressed")).resolves.toBe("false");
    await expect(page.getByRole("button", { name: /Unscheduled · 14/ }).getAttribute("aria-expanded")).resolves.toBe("false");

    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByRole("button", { name: "Month", exact: true }).getAttribute("aria-pressed")).resolves.toBe("true");
    await expect(statusFilters.locator("[data-calendar-status]").count()).resolves.toBe(5);
    await expect(page.getByLabel("Month calendar").getByText("Product story scheduled for this week", { exact: true }).count()).resolves.toBe(0);
    const monthCalendar = await page.getByLabel("Month calendar").boundingBox();
    if (!monthCalendar) throw new Error("Expected the Month calendar to be visible.");
    expect(monthCalendar.y + monthCalendar.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? 900);
    await page.screenshot({ path: "evidence/sunlit-calendar.png", fullPage: true });

    await page.setViewportSize({ height: 768, width: 1366 });
    await page.goto(`${baseUrl}/ar/app/calendar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "تقويم المحتوى" }).waitFor();
    await expect(page.locator("main").getAttribute("dir")).resolves.toBe("rtl");
    await expect(page.getByRole("link", { name: "التقويم" }).getAttribute("aria-current")).resolves.toBe("page");
    await expect.poll(() => page.getByRole("group", { name: "تصفية حالة المحتوى" }).isVisible()).toBe(true);
    await expect.poll(() => page.getByLabel("نوع المحتوى").isVisible()).toBe(true);
    await expect(page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).resolves.toBe(false);

    await page.getByRole("button", { name: "طي الشريط الجانبي" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-sidebar-collapsed]")?.dataset.sidebarCollapsed === "true" &&
        (document.querySelector<HTMLElement>("[data-app-sidebar]")?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY) < 120
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
    await expect.poll(() => focusSurface.getAttribute("data-calendar-motion-state")).toBe("reduced");
    // Reduced-motion CSS uses 0.01 ms transitions; Chromium can report these as pending until the next frame.
    // Inspect total timing (including delays and iterations) so visible motion still fails without waiting it away.
    await expect(
      page.locator('[data-calendar-layer="day"]').evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running" || animation.pending)
          .map((animation) => animation.effect?.getComputedTiming())
          .filter((timing) => Number(timing?.endTime ?? Number.POSITIVE_INFINITY) > 1)
      )
    ).resolves.toEqual([]);
    await page.keyboard.press("Escape");
    await page.locator('[data-calendar-layer="overview"]').waitFor();
    await page.emulateMedia({ reducedMotion: "no-preference" });

    expect(schedulePayload).toEqual({ scheduledAt: new Date(`${readyScheduleInput}:00+03:00`).toISOString() });
    expect(reschedulePayload).toEqual({ scheduledAt: new Date(`${rescheduleInput}:00+03:00`).toISOString() });
    expect(unscheduleCalls).toBe(1);
    await page.close();
  }, 60_000);

  it("keeps an empty Campaign page dismissible and registers an idea before opening Create", async () => {
    const emptyPage = await sessionPage();
    await mockApi(emptyPage, async (route, pathname) => {
      if (pathname === "/v1/campaigns/summaries") return route.fulfill(json({ items: [], nextCursor: null }));
      return route.fulfill(json([]));
    });

    await emptyPage.goto(`${baseUrl}/en/app/campaigns`, { waitUntil: "domcontentloaded" });
    await emptyPage.getByRole("button", { name: "New campaign", exact: true }).first().click();
    const closeComposer = emptyPage.getByRole("button", { name: "Close campaign composer" });
    await closeComposer.waitFor();
    await emptyPage.keyboard.press("Escape");
    await closeComposer.waitFor({ state: "detached" });
    await expect.poll(() => emptyPage.getByRole("heading", { name: "Start your first campaign" }).isVisible()).toBe(true);
    await emptyPage.getByRole("link", { name: "Overview" }).click();
    await emptyPage.waitForURL(`${baseUrl}/en/app`);
    await emptyPage.close();

    const page = await sessionPage();
    const campaign = phaseTwoCampaign();
    const draft = phaseTwoCampaignDraft(campaign.id);
    let registeredDraft: typeof draft | undefined;
    let approvalCalls = 0;
    let completeApproval!: () => void;
    const approvalResponse = new Promise<void>((resolve) => {
      completeApproval = resolve;
    });
    await mockApi(page, async (route, pathname) => {
      if (pathname === "/v1/campaigns/summaries") return route.fulfill(json({ items: [campaignSummaryFixture(campaign)], nextCursor: null }));
      if (pathname.endsWith("/review")) return route.fulfill(json({ campaign, items: registeredDraft ? [registeredDraft] : [], mediaAssets: [] }));
      if (pathname.endsWith("/drafts")) return route.fulfill(json(registeredDraft ? [registeredDraft] : []));
      if (pathname.endsWith("/suggestions/approve")) {
        approvalCalls += 1;
        await approvalResponse;
        registeredDraft = draft;
        return route.fulfill(json(draft));
      }
      if (pathname === "/v1/content") return route.fulfill(json(registeredDraft ? [registeredDraft] : []));
      if (pathname === `/v1/content/${draft.id}/conversation`)
        return route.fulfill(json({ id: null, contentItem: { ...draft, revision: 1 }, messages: [], latestRun: null }));
      return route.fulfill(json([]));
    });

    await page.goto(`${baseUrl}/en/app/campaigns`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Open campaign:/ }).click();
    await page.getByRole("button", { name: /Compare the subscription tiers/ }).click();
    const description = "Explain how every subscription tier supports a different kind of baker without hiding important pricing or delivery details.";
    const descriptionNode = page.getByText(description, { exact: true });
    await descriptionNode.waitFor();
    await expect(descriptionNode.evaluate((node) => getComputedStyle(node).whiteSpace)).resolves.toBe("normal");

    const beforeApproval = page.url();
    const approveButton = page.getByRole("button", { name: "Create draft: Compare the subscription tiers" });
    const createButton = page.getByRole("button", { name: "Open draft: Compare the subscription tiers" });
    await approveButton.click();
    try {
      await expect.poll(() => approvalCalls).toBe(1);
      await expect.poll(() => approveButton.isDisabled()).toBe(true);
      expect(page.url()).toBe(beforeApproval);
      await expect(createButton.count()).resolves.toBe(0);
    } finally {
      completeApproval();
    }
    await page.waitForURL(`${baseUrl}/en/app/content-studio?item=${draft.id}&source=campaign`);
    expect(approvalCalls).toBe(1);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await createButton.waitFor();
    expect(page.url()).toBe(beforeApproval);
    expect(approvalCalls).toBe(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await createButton.waitFor();
    expect(approvalCalls).toBe(1);
    await createButton.click();
    await page.waitForURL(`${baseUrl}/en/app/content-studio?item=${draft.id}&source=campaign`);
    await page.close();
  }, 60_000);

  it("opens unscheduled Calendar content in a right drawer and reuses the existing draft in Create", async () => {
    const page = await sessionPage();
    const draft = {
      ...studioContentRecord(),
      caption: "A saved SnackLab draft waiting for a publishing date.",
      id: "calendar-unscheduled-existing",
      status: "DRAFT",
      updatedAt: new Date().toISOString()
    };
    let createCalls = 0;

    await mockApi(page, async (route, pathname) => {
      const method = route.request().method();
      if (pathname === "/v1/calendar" && method === "GET") return route.fulfill(json(calendarReadResult([draft], route.request().url())));
      if (pathname === "/v1/content" && method === "GET") return route.fulfill(json([draft]));
      if (pathname === `/v1/content/${draft.id}/conversation`)
        return route.fulfill(json({ id: null, contentItem: { ...draft, revision: 1 }, messages: [], latestRun: null }));
      if (pathname === "/v1/content" && method === "POST") {
        createCalls += 1;
        return route.fulfill(json(draft));
      }
      if (pathname === "/v1/media" && method === "GET") return route.fulfill(json([]));
      return route.fulfill(json([]));
    });

    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto(`${baseUrl}/en/app/calendar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Content calendar" }).waitFor();

    const calendarSurface = page.locator("section.sunlit-panel").filter({ has: page.getByRole("button", { name: "Week", exact: true }) });
    const before = await calendarSurface.boundingBox();
    if (!before) throw new Error("Expected the Calendar surface to be visible.");

    const drawerButton = page.getByRole("button", { name: /Unscheduled · 1/ });
    await drawerButton.click();
    const drawer = page.getByRole("dialog", { name: /Unscheduled · 1/ });
    await drawer.waitFor();
    const after = await calendarSurface.boundingBox();
    if (!after) throw new Error("Expected the Calendar surface to remain visible behind the drawer.");
    expect(after.width).toBe(before.width);
    await page.screenshot({ path: "evidence/phase2-calendar-drawer.png" });

    const existingDraftLink = drawer.locator(`a[href*="item=${draft.id}"]`);
    await expect(existingDraftLink.getAttribute("href")).resolves.toBe(`/en/app/content-studio?item=${draft.id}&source=calendar`);

    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });

    await page.setViewportSize({ height: 600, width: 1440 });
    const shellScroll = page.locator("[data-app-content-scroll]");
    await expect(shellScroll.evaluate((element) => element.scrollHeight > element.clientHeight)).resolves.toBe(true);
    await shellScroll.evaluate((element) => element.scrollTo({ top: 160 }));
    await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
    await expect(page.locator("[data-app-sidebar]").evaluate((element) => Math.round(element.getBoundingClientRect().top))).resolves.toBe(0);
    await shellScroll.evaluate((element) => element.scrollTo({ top: 0 }));
    await page.setViewportSize({ height: 900, width: 1440 });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Content calendar" }).waitFor();
    await expect(page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).resolves.toBe(true);
    await drawerButton.click();
    await drawer.waitFor();
    await page.waitForTimeout(50);
    await expect(
      drawer.evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running" || animation.pending)
          .filter((animation) => Number(animation.effect?.getComputedTiming().duration ?? 0) > 20)
          .map((animation) => ({ duration: animation.effect?.getComputedTiming().duration, playState: animation.playState }))
      )
    ).resolves.toEqual([]);
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Content calendar" }).waitFor();
    await drawerButton.click();
    await existingDraftLink.click();
    await page.waitForURL(`${baseUrl}/en/app/content-studio?item=${draft.id}&source=calendar`);
    await page.getByRole("region", { name: "Post workspace", exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit caption", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Caption", exact: true }).inputValue()).resolves.toBe(draft.caption);
    expect(createCalls).toBe(0);
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

function campaignSummaryFixture(campaign: CampaignRecord) {
  const total = campaign.content.weeklyCadence.reduce((count, week) => count + week.days.reduce((sum, day) => sum + day.posts.length, 0), 0);
  return { ...campaign, postCounts: { total, idea: total, draft: 0, inReview: 0, ready: 0, scheduled: 0, published: 0, failed: 0 } };
}
function snackLabCampaign(): CampaignRecord {
  return {
    content: {
      durationDays: 14,
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
      summary: "A Vault-grounded 14-day Instagram campaign for SnackLab.",
      weeklyCadence: [
        {
          days: campaignWeekDays(1, "Publish origin story Reel"),
          focus: "Launch consistency",
          week: 1
        },
        {
          days: campaignWeekDays(8, "Publish customer taste-test Reel"),
          focus: "Earn trust",
          week: 2
        }
      ]
    },
    createdAt: "2026-08-09T11:35:00.000Z",
    durationDays: 14,
    endsAt: "2026-08-22T00:00:00.000Z",
    id: "campaign-snacklab-14",
    publishesPerDay: 1,
    startsAt: "2026-08-09T00:00:00.000Z",
    status: "REVIEW",
    title: "SnackLab 14-Day Instagram Campaign",
    updatedAt: "2026-08-09T11:35:00.000Z",
    version: 1,
    workspaceId: session.workspace.id
  };
}

function campaignWeekDays(firstDay: number, firstTitle: string) {
  return Array.from({ length: 7 }, (_, index) => ({
    day: firstDay + index,
    posts: [
      {
        contentType: "REEL" as const,
        title: index === 0 ? firstTitle : `SnackLab experiment ${firstDay + index}`,
        description: "Show a dessert experiment and invite followers to share their response.",
        goal: "Start qualified conversations",
        contentPillar: "Sweet experimentation"
      }
    ]
  }));
}

function snackLabCommunitySprint(): CampaignRecord {
  const campaign = snackLabCampaign();
  return {
    ...campaign,
    content: {
      ...campaign.content,
      durationDays: 7,
      objectives: ["Start useful customer conversations"],
      summary: "A focused seven-day community-building sprint.",
      weeklyCadence: [
        {
          days: campaignWeekDays(1, "Ask followers to choose the next experiment"),
          focus: "Invite participation",
          week: 1
        }
      ]
    },
    createdAt: "2026-08-02T11:35:00.000Z",
    durationDays: 7,
    endsAt: "2026-08-08T00:00:00.000Z",
    id: "campaign-snacklab-community",
    startsAt: "2026-08-02T00:00:00.000Z",
    title: "SnackLab 7-Day Community Sprint",
    updatedAt: "2026-08-02T11:35:00.000Z"
  };
}

function phaseTwoCampaign(): CampaignRecord {
  return {
    content: {
      durationDays: 7,
      kpis: [{ name: "Qualified inquiries", target: "12" }],
      nextActions: ["Prepare the approved ideas"],
      objectives: ["Help customers choose a subscription"],
      pillars: [{ contentAngles: ["Comparison"], name: "Offer education", rationale: "Make the plans easy to compare." }],
      publishesPerDay: 1,
      retrievedContext: [],
      risks: [],
      summary: "A focused seven-day campaign for SnackLab subscriptions.",
      weeklyCadence: [
        {
          days: [
            {
              day: 1,
              posts: [
                {
                  contentPillar: "Offer education",
                  contentType: "CAROUSEL",
                  description: "Explain how every subscription tier supports a different kind of baker without hiding important pricing or delivery details.",
                  goal: "Help customers choose a subscription",
                  title: "Compare the subscription tiers"
                }
              ]
            }
          ],
          focus: "Clarify the offer",
          week: 1
        }
      ]
    },
    createdAt: "2026-09-03T08:00:00.000Z",
    durationDays: 7,
    endsAt: "2026-09-09T00:00:00.000Z",
    id: "campaign-phase-two",
    publishesPerDay: 1,
    startsAt: "2026-09-03T00:00:00.000Z",
    status: "REVIEW",
    title: "SnackLab subscription guide",
    updatedAt: "2026-09-03T08:00:00.000Z",
    version: 1,
    workspaceId: session.workspace.id
  };
}

function phaseTwoCampaignDraft(campaignId: string) {
  return {
    brief:
      "Compare the subscription tiers\nExplain how every subscription tier supports a different kind of baker without hiding important pricing or delivery details.",
    campaignActionIndex: 0,
    campaignGoal: "Help customers choose a subscription",
    campaignId,
    campaignWeek: 1,
    contentPillar: "Offer education",
    contentType: "CAROUSEL" as const,
    createdAt: "2026-09-03T08:05:00.000Z",
    caption: "",
    revision: 1,
    id: "content-phase-two",
    mediaIds: [] as string[],
    plannedAt: "2026-09-03T00:00:00.000Z",
    platform: "INSTAGRAM" as const,
    status: "DRAFT" as const,
    updatedAt: "2026-09-03T08:05:00.000Z",
    workspaceId: session.workspace.id
  };
}

function campaignSuggestionDraft(campaignId = "campaign-snacklab-14") {
  return {
    id: "content-campaign-week-2-action-1",
    workspaceId: session.workspace.id,
    contentType: "REEL" as const,
    status: "DRAFT" as const,
    brief: "Publish customer taste-test Reel",
    caption: "",
    revision: 1,
    platform: "INSTAGRAM" as const,
    mediaIds: [] as string[],
    campaignId,
    campaignGoal: "Earn trust",
    campaignWeek: 2,
    campaignActionIndex: 0,
    createdAt: "2026-09-01T13:00:00.000Z",
    updatedAt: "2026-09-01T13:00:00.000Z"
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
    revision: 1,
    platform: "INSTAGRAM",
    caption: "Discover our new dessert subscription.\n\nاكتشفوا اشتراك الحلويات الجديد.\n\nSubscribe today\n\n#SnackLab #Bahrain",
    contentPillar: "Product launch",
    contentType: "POST",
    createdAt: "2026-08-17T10:00:00.000Z",
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

function json(data: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data }) };
}
