#!/usr/bin/env node

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright-core";

const webBaseUrl = trimTrailingSlash(
  process.env.WEB_BASE_URL ?? "http://localhost:3000",
);
const apiBaseUrl = trimTrailingSlash(
  process.env.API_BASE_URL ?? "http://localhost:4000",
);
const timeoutMs = Number.parseInt(
  process.env.LOCAL_AUTH_SMOKE_TIMEOUT_MS ?? "30000",
  10,
);
const sessionKey = "markos.session";

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

const results = [];
const browser = await launchBrowser();
const startedAt = new Date().toISOString();
const started = performance.now();

try {
  await runStep("api-health", async () => {
    const response = await fetch(`${apiBaseUrl}/v1/health`, {
      headers: { accept: "application/json" },
    });

    assert(response.ok, `Expected API health 2xx, got ${response.status}`);
  });

  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const email = `local-auth-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = "SmokeTest123!";

  await runStep("browser-signup", async () => {
    await page.goto(`${webBaseUrl}/en/signup`, { waitUntil: "domcontentloaded" });
    await page.locator('button[type="submit"]:not([disabled])').waitFor();
    await page.locator('input[autocomplete="name"]').fill("Local Smoke User");
    await page
      .locator('input[placeholder="e.g. Maryam Jewelry"]')
      .fill("Local Smoke Workspace");
    await page.locator('input[autocomplete="email"]').fill(email);
    await page.locator('input[autocomplete="new-password"]').fill(password);
    await page.locator('input[type="checkbox"]').check();

    await Promise.all([
      page.waitForURL(/\/en\/onboarding(?:$|[/?#])/, { timeout: timeoutMs }),
      page.getByRole("button", { name: /create account/i }).click(),
    ]);

    const identity = await readStoredIdentity(page);
    assertValidStoredIdentity(identity, email);
  });

  await runStep("browser-login", async () => {
    await page.request.post(`${apiBaseUrl}/v1/auth/logout`, {
      headers: { "X-Markos-Session": "browser" },
    });
    await page.evaluate((key) => window.localStorage.removeItem(key), sessionKey);
    await page.goto(`${webBaseUrl}/en/login`, { waitUntil: "domcontentloaded" });
    await page.locator('button[type="submit"]:not([disabled])').waitFor();
    await page.locator('input[autocomplete="email"]').fill(email);
    await page.locator('input[autocomplete="current-password"]').fill(password);

    try {
      await Promise.all([
        page.waitForURL(/\/en\/app(?:$|[/?#])/, { timeout: timeoutMs }),
        page.getByRole("button", { name: /log in to markos/i }).click(),
      ]);
    } catch (error) {
      const bodyText = await page.locator("body").innerText({ timeout: 1000 });
      const identity = await readStoredIdentity(page).catch(() => null);
      throw new Error(
        [
          error instanceof Error ? error.message : "Login did not route",
          `Current URL: ${page.url()}`,
          `Stored identity: ${identity ? "present" : "missing"}`,
          `Page text: ${bodyText.replace(/\s+/g, " ").slice(0, 700)}`,
        ].join("\n"),
      );
    }

    const identity = await readStoredIdentity(page);
    assertValidStoredIdentity(identity, email);
  });

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.passed);
const report = {
  gate: "local-auth",
  status: failed.length === 0 ? "passed" : "failed",
  webBaseUrl,
  apiBaseUrl,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: Math.round(performance.now() - started),
  results,
};

console.log(JSON.stringify(report, null, 2));

if (failed.length > 0) {
  process.exit(1);
}

async function runStep(name, action) {
  const stepStarted = performance.now();

  try {
    await action();
    results.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - stepStarted),
    });
  } catch (error) {
    results.push({
      name,
      passed: false,
      durationMs: Math.round(performance.now() - stepStarted),
      error: error instanceof Error ? error.message : "Unknown failure",
    });
  }
}

async function launchBrowser() {
  const executablePath =
    process.env.LOCAL_AUTH_SMOKE_BROWSER ??
    findInstalledBrowserExecutable();

  if (executablePath) {
    return chromium.launch({ executablePath, headless: true });
  }

  return chromium.launch({
    channel: process.platform === "win32" ? "msedge" : "chrome",
    headless: true,
  });
}

function findInstalledBrowserExecutable() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          ]
        : [
            "/usr/bin/microsoft-edge",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];

  return candidates.find((candidate) => existsSync(candidate));
}

async function readStoredIdentity(page) {
  return page.evaluate((key) => {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  }, sessionKey);
}

function assertValidStoredIdentity(identity, expectedEmail) {
  assert(identity && typeof identity === "object", "Missing stored auth identity");
  assert(identity.user?.email === expectedEmail, "Stored identity email mismatch");
  assert(!("tokens" in identity), "Stored identity must not contain auth tokens");
  assert(
    typeof identity.workspace?.id === "string" &&
      identity.workspace.id.length > 0,
    "Stored identity has no workspace id",
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function printHelp() {
  console.log(`MARKOS local auth smoke

Required:
  Running web and API dev servers.

Optional environment:
  WEB_BASE_URL=http://localhost:3000
  API_BASE_URL=http://localhost:4000
  LOCAL_AUTH_SMOKE_TIMEOUT_MS=30000
  LOCAL_AUTH_SMOKE_BROWSER="C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"

Checks:
  1. API health endpoint responds.
  2. Browser signup stores token-free identity metadata and routes to /en/onboarding.
  3. Browser login stores token-free identity metadata and routes to /en/app.
`);
}
