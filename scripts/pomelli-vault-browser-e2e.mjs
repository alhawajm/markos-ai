import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const browserPath =
  process.env.UI_BROWSER_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputPath = path.resolve(
  process.env.POMELLI_E2E_SCREENSHOT ??
    path.join("evidence", "ui", "pomelli-vault-browser-e2e.png"),
);
const workspaceId = "018ffd04-3f8a-7000-8000-000000000002";
const userId = "018ffd04-3f8a-7000-8000-000000000001";
const jobId = "018ffd04-3f8a-7000-8000-000000000101";
const draftId = "018ffd04-3f8a-7000-8000-000000000102";
const sourceUrl = "https://browser-e2e.example/";
const createdAt = "2026-07-19T12:00:00.000Z";
const candidate = {
  section: "COMPANY",
  key: "website-profile",
  value: { name: "Browser Test Brand", market: "Bahrain" },
  confidence: 0.86,
  sourceUrl,
  sourceSnippet: "Premium jewelry collections crafted for Bahrain businesses",
  extractedAt: createdAt,
};
const pendingDraft = {
  id: draftId,
  workspaceId,
  sourceUrl,
  sourceTitle: "Browser Test Brand",
  candidates: [candidate],
  status: "PENDING",
  confidence: 0.86,
  createdAt,
  updatedAt: createdAt,
};
let jobPolls = 0;
let approvalBody;
let approved = false;
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
    {
      session: {
        user: {
          id: userId,
          email: "browser-e2e@markos.test",
          fullName: "Browser E2E User",
          locale: "en",
          isVerified: true,
        },
        workspace: {
          id: workspaceId,
          name: "Browser E2E Workspace",
          slug: "browser-e2e-workspace",
        },
        roles: ["OWNER"],
        tokens: {
          accessToken: "browser-e2e-access-token",
          refreshToken: "browser-e2e-refresh-token",
          expiresIn: 900,
        },
      },
    },
  );

  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });

  await page.route("**/v1/vault/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (request.method() === "GET" && pathname === "/v1/vault/score") {
      return fulfill(route, {
        score: approved ? 100 : 29,
        completedSections: approved ? ["COMPANY"] : [],
        missingSections: approved ? [] : ["COMPANY", "STORY", "PRODUCTS"],
        requiredSections: ["COMPANY"],
        entryCount: approved ? 1 : 0,
      });
    }

    if (
      request.method() === "POST" &&
      pathname === "/v1/vault/ingest/website/jobs"
    ) {
      const requestBody = request.postDataJSON();
      assert.equal(requestBody.url, sourceUrl);
      assert.equal(requestBody.maxPages, 5);
      return fulfill(
        route,
        {
          id: jobId,
          workspaceId,
          sourceUrl,
          maxPages: 5,
          status: "QUEUED",
          attempts: 0,
          createdAt,
          updatedAt: createdAt,
        },
        202,
      );
    }

    if (
      request.method() === "GET" &&
      pathname === `/v1/vault/ingest/website/jobs/${jobId}`
    ) {
      jobPolls += 1;
      return fulfill(route, {
        id: jobId,
        workspaceId,
        sourceUrl,
        maxPages: 5,
        status: jobPolls === 1 ? "PROCESSING" : "COMPLETED",
        attempts: 1,
        ...(jobPolls === 1 ? {} : { draftId, completedAt: createdAt }),
        startedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
    }

    if (
      request.method() === "GET" &&
      pathname === `/v1/vault/ingest/${draftId}`
    ) {
      return fulfill(route, pendingDraft);
    }

    if (
      request.method() === "POST" &&
      pathname === `/v1/vault/ingest/${draftId}/approve`
    ) {
      approvalBody = request.postDataJSON();
      approved = true;
      return fulfill(route, {
        ...pendingDraft,
        candidates: approvalBody.candidates,
        status: "APPROVED",
        reviewedAt: createdAt,
        updatedAt: createdAt,
      });
    }

    throw new Error(
      `Unexpected Vault browser request: ${request.method()} ${pathname}`,
    );
  });

  await page.goto(`${baseUrl}/en/app/knowledge`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("vault-website-url").fill(sourceUrl);
  await page.getByTestId("vault-deep-scan").click();
  await page.getByTestId("vault-ingest-review").waitFor({ timeout: 10_000 });

  const editedValue = {
    name: "Browser Verified Brand",
    market: "Bahrain",
    evidenceStatus: "reviewed",
  };
  await page
    .getByTestId("vault-ingest-review")
    .locator("textarea")
    .first()
    .fill(JSON.stringify(editedValue, null, 2));
  await page.getByTestId("vault-write-merge").click();
  await page.getByTestId("vault-approve-facts").click();
  await page
    .getByText("Approved facts were saved to the Knowledge Vault", {
      exact: false,
    })
    .waitFor();
  await page.getByText("100%", { exact: true }).waitFor();
  await page.screenshot({ path: outputPath, fullPage: true });

  assert.equal(jobPolls, 2);
  assert.equal(approvalBody.writeMode, "MERGE");
  assert.deepEqual(approvalBody.candidates[0].value, editedValue);
  assert.deepEqual(browserErrors, []);

  console.log(`Pomelli Vault browser E2E passed. Screenshot: ${outputPath}`);
} finally {
  await browser.close();
}

function fulfill(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}
