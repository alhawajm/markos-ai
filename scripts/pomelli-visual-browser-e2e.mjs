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
const outputPath = process.env.POMELLI_VISUAL_E2E_SCREENSHOT
  ? path.resolve(process.env.POMELLI_VISUAL_E2E_SCREENSHOT)
  : path.join(
      repositoryRoot,
      "evidence",
      "ui",
      "pomelli-visual-browser-e2e.png",
    );
const workspaceId = "018ffd04-3f8a-7000-8000-000000000002";
const userId = "018ffd04-3f8a-7000-8000-000000000001";
const contentItemId = "018ffd04-3f8a-7000-8000-000000000201";
const variantId = "018ffd04-3f8a-7000-8000-000000000202";
const mediaAssetId = "018ffd04-3f8a-7000-8000-000000000203";
const createdAt = "2026-07-20T08:00:00.000Z";
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4f8AAAAASUVORK5CYII=";
const draft = {
  id: contentItemId,
  workspaceId,
  contentType: "POST",
  status: "DRAFT",
  captionEn: "A premium Bahrain launch crafted for modern customers.",
  hashtags: ["#Bahrain", "#Launch"],
  callToAction: "Discover the collection",
  mediaIds: [],
  contentPillar: "Product launch",
  createdAt,
  updatedAt: createdAt,
};
const mediaAsset = {
  id: mediaAssetId,
  workspaceId,
  type: "AI_GENERATED",
  filename: "visual-browser-e2e.png",
  publicUrl: pixel,
  mimeType: "image/png",
  sizeBytes: 68,
  width: 1080,
  height: 1350,
  createdAt,
  updatedAt: createdAt,
};
const pendingVariant = {
  id: variantId,
  workspaceId,
  mediaAssetId,
  mediaAsset,
  contentItemId,
  sourceMediaAssetIds: [],
  visualMode: "PRODUCT_PHOTO",
  aspectRatio: "4:5",
  prompt: "Premium product launch visual",
  negativePrompt: "No distorted logos or unreadable text.",
  model: "browser-e2e-image-model",
  promptVersion: "image.visual-studio.browser-e2e",
  status: "PENDING_REVIEW",
  qualityStatus: "REVIEW_REQUIRED",
  qualityScores: {
    brandAlignment: 82,
    composition: 80,
    overall: 84,
    platformReadiness: 84,
    productAccuracy: 90,
  },
  metadata: { source: "visual_studio", variantIndex: 1 },
  createdAt,
  updatedAt: createdAt,
};
let generationBody;
let approvalCalls = 0;
let approvalBody;
let attachmentBody;
const browserErrors = [];

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
    if (request.method() === "GET" && pathname === "/v1/content")
      return fulfill(route, [draft]);
    if (request.method() === "GET" && pathname === "/v1/media")
      return fulfill(route, []);
    if (
      request.method() === "GET" &&
      pathname === "/v1/media/visual-studio/variants"
    )
      return fulfill(route, []);
    if (
      request.method() === "GET" &&
      pathname === "/v1/media/visual-studio/learning-insights"
    ) {
      return fulfill(route, {
        workspaceId,
        generatedAt: createdAt,
        feedbackCount: approvalCalls,
        performanceLinkedCount: 0,
        positivePatternCount: approvalCalls,
        negativePatternCount: 0,
        topPositive: [],
        topNegative: [],
        recommendations: approvalCalls
          ? [
              "Repeat: product-first portrait creative with strong brand alignment.",
            ]
          : [
              "Approve or reject generated assets to start the creative learning loop.",
            ],
      });
    }

    if (
      request.method() === "POST" &&
      pathname === "/v1/media/visual-studio/generate"
    ) {
      generationBody = request.postDataJSON();
      return fulfill(route, {
        variants: [pendingVariant],
        model: pendingVariant.model,
        promptVersion: pendingVariant.promptVersion,
      });
    }

    if (
      request.method() === "POST" &&
      pathname === `/v1/media/visual-studio/variants/${variantId}/approve`
    ) {
      approvalCalls += 1;
      approvalBody = request.postDataJSON();
      return fulfill(route, {
        ...pendingVariant,
        status: "APPROVED",
        qualityStatus: "APPROVED",
        latestFeedback: {
          id: "018ffd04-3f8a-7000-8000-000000000204",
          workspaceId,
          generatedMediaVariantId: variantId,
          decision: "APPROVED",
          reasonCodes: approvalBody.reasonCodes,
          scores: approvalBody.scores,
          createdAt,
        },
      });
    }

    if (
      request.method() === "POST" &&
      pathname ===
        `/v1/media/visual-studio/variants/${variantId}/attach-to-content`
    ) {
      attachmentBody = request.postDataJSON();
      return fulfill(route, {
        ...draft,
        mediaIds: [mediaAssetId],
        updatedAt: "2026-07-20T08:01:00.000Z",
      });
    }

    throw new Error(
      `Unexpected Visual Studio browser request: ${request.method()} ${pathname}`,
    );
  });

  await page.goto(`${baseUrl}/en/app/content-studio?item=${contentItemId}`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("visual-generate").click();
  await page.getByTestId(`visual-variant-${variantId}`).waitFor();
  await page.getByTestId(`visual-approve-${variantId}`).click();
  await page.getByText("Visual approved", { exact: false }).waitFor();
  await page.getByTestId(`visual-use-${variantId}`).click();
  await page
    .getByTestId("visual-message")
    .filter({ hasText: "Approved visual attached" })
    .waitFor();
  await page.screenshot({ path: outputPath, fullPage: true });

  assert.equal(generationBody.contentItemId, contentItemId);
  assert.equal(generationBody.aspectRatio, "4:5");
  assert.equal(generationBody.visualMode, "PRODUCT_PHOTO");
  assert.equal(approvalCalls, 1);
  assert.deepEqual(approvalBody.reasonCodes, [
    "ON_BRAND",
    "PRODUCT_ACCURATE",
    "STRONG_COMPOSITION",
    "READY_TO_PUBLISH",
  ]);
  assert.equal(approvalBody.scores.overall, 84);
  assert.deepEqual(attachmentBody, { contentItemId });
  assert.deepEqual(browserErrors, []);

  console.log(
    `Pomelli Visual Studio browser E2E passed. Screenshot: ${outputPath}`,
  );
} finally {
  await browser.close();
}

function browserSession() {
  return {
    user: {
      id: userId,
      email: "visual-browser-e2e@markos.test",
      fullName: "Visual Browser E2E User",
      locale: "en",
      isVerified: true,
    },
    workspace: {
      id: workspaceId,
      name: "Visual E2E Workspace",
      slug: "visual-e2e-workspace",
    },
    roles: ["OWNER"],
    tokens: {
      accessToken: "visual-browser-e2e-access-token",
      refreshToken: "visual-browser-e2e-refresh-token",
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
