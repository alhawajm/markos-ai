import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const stamp = new Date().toISOString().slice(0, 10);
const outputRoot = process.env.UI_SCREENSHOT_DIR ?? path.join("evidence", "ui", stamp);
const browserPath = process.env.UI_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const routeFilter = process.env.UI_SCREENSHOT_ROUTES?.split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const viewportFilter = process.env.UI_SCREENSHOT_VIEWPORTS?.split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const routes = [
  { name: "dashboard-en", path: "/en" },
  { name: "briefing-en", path: "/en/briefing" },
  { name: "opportunities-en", path: "/en/opportunities" },
  { name: "campaign-builder-en", path: "/en/campaign-builder" },
  { name: "content-studio-en", path: "/en/content-studio" },
  { name: "knowledge-en", path: "/en/knowledge" },
  { name: "content-en", path: "/en/content" },
  { name: "content-quota-warning-en", path: "/en/content?quota=warning" },
  { name: "content-quota-blocked-en", path: "/en/content?quota=blocked" },
  { name: "content-vault-gap-en", path: "/en/content?vault=gap" },
  { name: "content-carousel-en", path: "/en/content?type=carousel&state=generated" },
  { name: "content-story-en", path: "/en/content?type=story&state=generated" },
  { name: "schedule-en", path: "/en/schedule" },
  { name: "schedule-publish-blocked-en", path: "/en/schedule?publish=blocked" },
  { name: "schedule-publish-failed-en", path: "/en/schedule?publish=failed" },
  { name: "analytics-en", path: "/en/analytics" },
  { name: "analytics-learning-en", path: "/en/analytics?learning=saved" },
  { name: "audience-en", path: "/en/audience" },
  { name: "audience-state-loading-en", path: "/en/audience?state=loading" },
  { name: "audience-state-error-en", path: "/en/audience?state=error" },
  { name: "audience-state-limit-en", path: "/en/audience?state=limit" },
  { name: "channels-en", path: "/en/channels" },
  { name: "channels-state-loading-en", path: "/en/channels?state=loading" },
  { name: "channels-state-error-en", path: "/en/channels?state=error" },
  { name: "channels-state-limit-en", path: "/en/channels?state=limit" },
  { name: "vault-en", path: "/en/vault" },
  { name: "strategy-en", path: "/en/strategy" },
  { name: "strategy-quota-blocked-en", path: "/en/strategy?quota=blocked" },
  { name: "strategy-vault-gap-en", path: "/en/strategy?vault=gap" },
  { name: "ai-en", path: "/en/ai" },
  { name: "ai-quota-warning-en", path: "/en/ai?quota=warning" },
  { name: "ai-vault-gap-en", path: "/en/ai?vault=gap" },
  { name: "settings-en", path: "/en/settings" },
  { name: "settings-state-error-en", path: "/en/settings?state=error" },
  { name: "settings-state-limit-en", path: "/en/settings?state=limit" },
  { name: "admin-en", path: "/en/admin" },
  { name: "admin-state-error-en", path: "/en/admin?state=error" },
  { name: "admin-state-limit-en", path: "/en/admin?state=limit" },
  { name: "schedule-calendar-en", path: "/en/schedule?view=calendar&bestTimes=1" },
  { name: "onboarding-en", path: "/en/onboarding" },
  ...Array.from({ length: 7 }, (_, index) => ({
    name: `onboarding-step-${index + 1}-en`,
    path: `/en/onboarding?step=${index + 1}`
  })),
  { name: "dashboard-ar", path: "/ar" },
  { name: "briefing-ar", path: "/ar/briefing" },
  { name: "opportunities-ar", path: "/ar/opportunities" },
  { name: "campaign-builder-ar", path: "/ar/campaign-builder" },
  { name: "content-studio-ar", path: "/ar/content-studio" },
  { name: "knowledge-ar", path: "/ar/knowledge" },
  { name: "content-ar", path: "/ar/content" },
  { name: "content-quota-warning-ar", path: "/ar/content?quota=warning" },
  { name: "content-quota-blocked-ar", path: "/ar/content?quota=blocked" },
  { name: "content-vault-gap-ar", path: "/ar/content?vault=gap" },
  { name: "content-carousel-ar", path: "/ar/content?type=carousel&state=generated" },
  { name: "content-story-ar", path: "/ar/content?type=story&state=generated" },
  { name: "schedule-ar", path: "/ar/schedule" },
  { name: "schedule-publish-blocked-ar", path: "/ar/schedule?publish=blocked" },
  { name: "schedule-publish-failed-ar", path: "/ar/schedule?publish=failed" },
  { name: "analytics-ar", path: "/ar/analytics" },
  { name: "analytics-learning-ar", path: "/ar/analytics?learning=saved" },
  { name: "audience-ar", path: "/ar/audience" },
  { name: "audience-state-loading-ar", path: "/ar/audience?state=loading" },
  { name: "audience-state-error-ar", path: "/ar/audience?state=error" },
  { name: "audience-state-limit-ar", path: "/ar/audience?state=limit" },
  { name: "channels-ar", path: "/ar/channels" },
  { name: "channels-state-loading-ar", path: "/ar/channels?state=loading" },
  { name: "channels-state-error-ar", path: "/ar/channels?state=error" },
  { name: "channels-state-limit-ar", path: "/ar/channels?state=limit" },
  { name: "vault-ar", path: "/ar/vault" },
  { name: "strategy-ar", path: "/ar/strategy" },
  { name: "strategy-quota-blocked-ar", path: "/ar/strategy?quota=blocked" },
  { name: "strategy-vault-gap-ar", path: "/ar/strategy?vault=gap" },
  { name: "ai-ar", path: "/ar/ai" },
  { name: "ai-quota-warning-ar", path: "/ar/ai?quota=warning" },
  { name: "ai-vault-gap-ar", path: "/ar/ai?vault=gap" },
  { name: "settings-ar", path: "/ar/settings" },
  { name: "settings-state-error-ar", path: "/ar/settings?state=error" },
  { name: "settings-state-limit-ar", path: "/ar/settings?state=limit" },
  { name: "admin-ar", path: "/ar/admin" },
  { name: "admin-state-error-ar", path: "/ar/admin?state=error" },
  { name: "admin-state-limit-ar", path: "/ar/admin?state=limit" },
  { name: "schedule-calendar-ar", path: "/ar/schedule?view=calendar&bestTimes=1" },
  { name: "onboarding-ar", path: "/ar/onboarding" },
  ...Array.from({ length: 7 }, (_, index) => ({
    name: `onboarding-step-${index + 1}-ar`,
    path: `/ar/onboarding?step=${index + 1}`
  }))
].filter((route) => !routeFilter?.length || routeFilter.includes(route.name));

const viewports = [
  { name: "desktop", size: "1440,1000" },
  { name: "wide", size: "1920,1080" },
  { name: "tablet", size: "1024,900" },
  { name: "mobile", size: "390,844" }
].filter((viewport) => !viewportFilter?.length || viewportFilter.includes(viewport.name));

await mkdir(outputRoot, { recursive: true });

for (const route of routes) {
  for (const viewport of viewports) {
    const filePath = path.resolve(outputRoot, `${route.name}-${viewport.name}.png`);
    const url = `${baseUrl}${route.path}`;
    const userDataDir = path.join(os.tmpdir(), `markos-ui-shot-${process.pid}-${route.name}-${viewport.name}`);

    await execFileAsync(
      browserPath,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--no-first-run",
        "--disable-extensions",
        "--virtual-time-budget=2500",
        `--user-data-dir=${userDataDir}`,
        `--window-size=${viewport.size}`,
        `--screenshot=${filePath}`,
        url
      ],
      { timeout: 45_000 }
    );

    console.log(`Captured ${url} at ${viewport.size} -> ${filePath}`);
  }
}
