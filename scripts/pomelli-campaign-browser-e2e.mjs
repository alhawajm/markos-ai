import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const browserPath =
  process.env.UI_BROWSER_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = process.env.POMELLI_CAMPAIGN_E2E_SCREENSHOT
  ? path.resolve(process.env.POMELLI_CAMPAIGN_E2E_SCREENSHOT)
  : path.join(
      repositoryRoot,
      "evidence",
      "ui",
      "pomelli-campaign-browser-e2e.png",
    );
const workspaceId = "018ffd04-3f8a-7000-8000-000000000002";
const userId = "018ffd04-3f8a-7000-8000-000000000001";
const campaignId = "018ffd04-3f8a-7000-8000-000000000301";
const contentItemId = "018ffd04-3f8a-7000-8000-000000000302";
const createdAt = "2026-07-20T08:00:00.000Z";
const originalCaption =
  "Launch our premium Bahrain collection with confidence.";
const editedCaption =
  "Launch our verified premium Bahrain collection this week.";
const browserErrors = [];
let generationBody;
let updateBody;
let approvalCalls = 0;
let scheduleBody;

function contentRecord(status = "DRAFT", captionEn = originalCaption) {
  return {
    id: contentItemId,
    workspaceId,
    contentType: "POST",
    status,
    captionEn,
    hashtags: ["#Bahrain", "#PremiumLaunch"],
    callToAction: "Discover now",
    mediaIds: [],
    contentPillar: "Product launch",
    campaignId,
    ...(status === "SCHEDULED"
      ? { scheduledAt: "2026-07-21T16:30:00.000Z" }
      : {}),
    createdAt,
    updatedAt: createdAt,
  };
}

function campaignPackage(status = "GENERATED", captionEn = originalCaption) {
  const itemStatus =
    status === "APPROVED"
      ? "APPROVED"
      : status === "SCHEDULED"
        ? "SCHEDULED"
        : "DRAFT";
  return {
    campaign: {
      id: campaignId,
      workspaceId,
      name: "Premium Bahrain Launch",
      objective: "Launch a premium campaign for Bahrain customers.",
      status,
      structuredBrief: {
        contentCount: 1,
        contentTypes: ["POST"],
        durationDays: 7,
        objective: "Launch a premium campaign for Bahrain customers.",
      },
      package: {
        angles: ["Crafted for Bahrain"],
        items: [
          {
            contentItemId,
            contentType: "POST",
            day: 1,
            angle: "Crafted for Bahrain",
            status: itemStatus,
          },
        ],
        objectives: [
          { label: "Assets", value: "1" },
          { label: "Window", value: "7 days" },
          { label: "Status", value: status },
        ],
        rationale: "Vault-grounded launch package.",
        schedule:
          status === "SCHEDULED"
            ? [
                {
                  contentItemId,
                  day: 1,
                  scheduledAt: "2026-07-21T16:30:00.000Z",
                },
              ]
            : [],
      },
      rationale: "Vault-grounded launch package.",
      rejectedIdeas: [],
      generatedAt: createdAt,
      ...(status === "APPROVED" || status === "SCHEDULED"
        ? { approvedAt: createdAt }
        : {}),
      createdAt,
      updatedAt: createdAt,
    },
    contentItems: [contentRecord(itemStatus, captionEn)],
  };
}

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    ({ session }) => {
      window.localStorage.setItem("markos.session", JSON.stringify(session));
    },
    { session: browserSession() },
  );

  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/v1/catalog/products")
      return fulfill(route, []);
    if (request.method() === "GET" && pathname === "/v1/catalog/offers")
      return fulfill(route, []);

    if (
      request.method() === "POST" &&
      pathname === "/v1/campaigns/packages/generate"
    ) {
      generationBody = request.postDataJSON();
      return fulfill(route, campaignPackage());
    }

    if (
      request.method() === "PATCH" &&
      pathname === `/v1/content/${contentItemId}`
    ) {
      updateBody = request.postDataJSON();
      return fulfill(route, contentRecord("DRAFT", updateBody.captionEn));
    }

    if (
      request.method() === "POST" &&
      pathname === `/v1/campaigns/${campaignId}/approve`
    ) {
      approvalCalls += 1;
      return fulfill(route, campaignPackage("APPROVED", editedCaption));
    }

    if (
      request.method() === "POST" &&
      pathname === `/v1/campaigns/${campaignId}/schedule`
    ) {
      scheduleBody = request.postDataJSON();
      return fulfill(route, campaignPackage("SCHEDULED", editedCaption));
    }

    throw new Error(
      `Unexpected Campaign browser request: ${request.method()} ${pathname}`,
    );
  });

  await page.goto(`${baseUrl}/en/app/campaign-builder`, {
    waitUntil: "networkidle",
  });
  await page
    .getByTestId("campaign-brief")
    .fill(
      "Launch a premium campaign for Bahrain customers using approved brand memory.",
    );
  await page.getByTestId("campaign-generate").click();
  await page.getByTestId("campaign-package").waitFor();
  await page.getByTestId(`campaign-edit-${contentItemId}`).click();
  await page
    .getByTestId(`campaign-caption-${contentItemId}`)
    .fill(editedCaption);
  await page.getByTestId(`campaign-save-${contentItemId}`).click();
  await page.getByText("Campaign item edits saved", { exact: false }).waitFor();
  await page.getByTestId("campaign-approve").click();
  await page.getByText("campaign assets approved", { exact: false }).waitFor();
  await page.getByTestId("campaign-schedule").click();
  await page.getByText("campaign items scheduled", { exact: false }).waitFor();
  await page.screenshot({ path: outputPath, fullPage: true });

  assert.equal(generationBody.brief.contentCount, 4);
  assert.equal(generationBody.brief.durationDays, 7);
  assert.equal(updateBody.captionEn, editedCaption);
  assert.equal(approvalCalls, 1);
  assert.deepEqual(scheduleBody, { time: "19:30" });
  assert.deepEqual(browserErrors, []);

  console.log(
    `Pomelli Campaign Workbench browser E2E passed. Screenshot: ${outputPath}`,
  );
} finally {
  await browser.close();
}

function browserSession() {
  return {
    user: {
      id: userId,
      email: "campaign-browser-e2e@markos.test",
      fullName: "Campaign Browser E2E User",
      locale: "en",
      isVerified: true,
    },
    workspace: {
      id: workspaceId,
      name: "Campaign E2E Workspace",
      slug: "campaign-e2e-workspace",
    },
    roles: ["OWNER"],
    tokens: {
      accessToken: "campaign-browser-e2e-access-token",
      refreshToken: "campaign-browser-e2e-refresh-token",
      expiresIn: 900,
    },
  };
}

function fulfill(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}
