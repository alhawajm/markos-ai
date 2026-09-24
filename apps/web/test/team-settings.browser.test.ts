import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
const timestamp = "2026-09-24T06:00:00.000Z";
const session = {
  user: { id: "owner", fullName: "MARKOS Owner", email: "owner@example.test", locale: "en", isVerified: true },
  workspace: { id: "workspace-a", name: "Blooms in Pink", slug: "blooms" },
  roles: ["OWNER"],
  mfaVerified: false,
  mfaVerifiedUntil: null,
  tokens: { accessToken: "fixture-only", expiresIn: 900 }
};
let browser: Browser;
const payload = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
async function open(locale: "en" | "ar", section: string, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  let invited = false,
    updated = false;
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    const path = url.pathname;
    if (path === "/v1/auth/refresh") return route.fulfill(payload(session));
    if (path === "/v1/onboarding") return route.fulfill(payload({ status: "COMPLETE", businessProfile: { status: "APPROVED" } }));
    if (path === "/v1/workspace/instagram") return route.fulfill(payload({ connected: false, status: "DISCONNECTED", recentMedia: [] }));
    if (path === "/v1/billing/summary") return route.fulfill(payload({ invoices: [], payments: [] }));
    if (path === "/v1/auth/mfa/totp") return route.fulfill(payload({ enabled: false }));
    if (path === "/v1/workspace/audit-logs" || path === "/v1/notifications") return route.fulfill(payload([]));
    if (path === "/v1/account") {
      if (method === "PATCH") {
        expect(route.request().postDataJSON()).toMatchObject({ fullName: "Updated Owner", expectedUpdatedAt: timestamp });
        updated = true;
        return route.fulfill(payload({ saved: true }));
      }
      return route.fulfill(
        payload({
          user: { ...session.user, fullName: updated ? "Updated Owner" : session.user.fullName, updatedAt: timestamp, mfaEnabled: false },
          workspace: { ...session.workspace, ownerUserId: "owner", updatedAt: timestamp }
        })
      );
    }
    if (path === "/v1/workspaces") return route.fulfill(payload([{ ...session.workspace, ownerUserId: "owner", roles: ["OWNER"] }]));
    if (path === "/v1/workspace/team")
      return route.fulfill(
        payload({
          ownerUserId: "owner",
          members: [
            { id: "member-owner", userId: "owner", fullName: "MARKOS Owner", email: "owner@example.test", role: "OWNER" },
            { id: "member-editor", userId: "editor", fullName: "Campaign Designer", email: "designer@example.test", role: "EDITOR" }
          ],
          invitations: invited ? [{ id: "invitation-a", email: "teammate@example.test", role: "EDITOR", expiresAt: "2026-10-01T06:00:00.000Z" }] : []
        })
      );
    if (path === "/v1/workspace/team/invitations" && method === "POST") {
      expect(route.request().postDataJSON()).toEqual({ email: "teammate@example.test", role: "EDITOR" });
      invited = true;
      return route.fulfill(
        payload({ id: "invitation-a", email: "teammate@example.test", role: "EDITOR", code: "a".repeat(64), expiresAt: "2026-10-01T06:00:00.000Z" })
      );
    }
    if (path === "/v1/workspace/team/invitations/invitation-a" && method === "DELETE") {
      invited = false;
      return route.fulfill(payload({ revoked: true }));
    }
    return route.fulfill(payload({}));
  });
  await page.goto(`${baseUrl}/${locale}/app/settings#${section}`);
  return page;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
describe("team and account settings", () => {
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    mkdirSync("evidence", { recursive: true });
  });
  afterAll(async () => {
    await browser?.close();
  });
  it("creates a shareable invitation, revokes it and protects owner access", async () => {
    const page = await open("en", "team");
    const panel = page.locator("#team");
    await panel.getByRole("heading", { name: "Members", exact: true }).waitFor();
    await panel.getByLabel("Email", { exact: true }).fill("teammate@example.test");
    await panel.getByRole("button", { name: "Create invitation" }).click();
    await panel.locator("code").waitFor();
    expect(await panel.locator("code").innerText()).toBe("a".repeat(64));
    expect(await panel.getByRole("button", { name: "Remove member" }).count()).toBe(1);
    await noOverflow(page);
    await page.screenshot({ path: "evidence/team-en-desktop.png", fullPage: true });
    page.on("dialog", (dialog) => void dialog.accept());
    await panel.getByRole("button", { name: "Revoke", exact: true }).click();
    await panel.getByRole("heading", { name: "Pending invitations" }).waitFor({ state: "detached" });
    await page.close();
  });
  it("renders Arabic team controls on a narrow screen without horizontal overflow", async () => {
    const page = await open("ar", "team", 390);
    const panel = page.locator("#team");
    await panel.getByRole("heading", { name: "الأعضاء", exact: true }).waitFor();
    expect(await panel.getAttribute("dir")).toBe("rtl");
    await noOverflow(page);
    await page.screenshot({ path: "evidence/team-ar-mobile.png", fullPage: true });
    await page.close();
  });
  it("saves account details with the loaded revision", async () => {
    const page = await open("en", "profile");
    await page.getByLabel("Full name", { exact: true }).fill("Updated Owner");
    await page.getByRole("button", { name: "Save account details" }).click();
    await page.getByText("Details saved.", { exact: true }).waitFor();
    expect(await page.getByLabel("Full name", { exact: true }).inputValue()).toBe("Updated Owner");
    await page.close();
  });
});
