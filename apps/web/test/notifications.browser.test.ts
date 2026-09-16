import { chromium } from "playwright-core";
import { expect, it } from "vitest";

it("shows only the signed-in owner's in-app notices across accounts in the same browser", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  let account = "a";
  const session = () => ({
    tokens: { accessToken: `token-${account}`, expiresIn: 900 },
    user: { id: account, email: `${account}@example.test`, fullName: "Test Owner", locale: "en", isVerified: true },
    workspace: { id: `workspace-${account}`, name: "Test workspace", slug: `workspace-${account}` },
    roles: ["OWNER"]
  });
  const notice = {
    id: "notice-a",
    userId: "a",
    workspaceId: "workspace-a",
    channel: "IN_APP",
    templateKey: "publishing_failed",
    payload: { message: "Private failed post belonging to A" },
    createdAt: "2026-09-16T09:00:00Z",
    updatedAt: "2026-09-16T09:00:00Z"
  };
  try {
    await page.route(/^http:\/\/(localhost|127\.0\.0\.1):4000\//, async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path === "/v1/auth/refresh") data = session();
      if (path === "/v1/onboarding") data = { status: "COMPLETE", businessProfile: { status: "APPROVED" } };
      // Deliberately include foreign/email rows: client must fail closed as well.
      if (path === "/v1/notifications") data = [notice, { ...notice, id: "email", channel: "EMAIL", templateKey: "monthly_analytics_pdf", payload: {} }];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    });
    const url = `${process.env.SETTINGS_BROWSER_BASE_URL}/en/app/content-studio`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Notifications/ })
      .first()
      .click();
    await page.getByText(notice.payload.message, { exact: true }).waitFor();
    expect(await page.getByText("Publishing needs attention", { exact: true }).count()).toBe(1);
    account = "b";
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Notifications/ })
      .first()
      .click();
    await page.getByText("No notifications yet.", { exact: true }).waitFor();
    expect(await page.getByText(notice.payload.message, { exact: true }).count()).toBe(0);
    expect(await page.getByText("Publishing needs attention", { exact: true }).count()).toBe(0);
  } finally {
    await context.close();
    await browser.close();
  }
});
