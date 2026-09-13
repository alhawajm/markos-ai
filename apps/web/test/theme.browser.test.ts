import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPlexFonts } from "./browser-fonts";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered appearance tests");
const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;

let browser: Browser;

async function readPalette(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(["text", "background", "primary", "secondary", "accent"].map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
  });
}

async function primaryButtonContrast(page: Page) {
  return page
    .getByRole("link", { name: "Start free", exact: true })
    .nth(1)
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => {
        const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((part) => {
          const channel = Number(part) / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      };
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
}

async function assertCollapsedSidebar(page: Page, rtl = false) {
  await page.locator("[data-sidebar-collapsed]").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const sidebar = page.locator("[data-app-sidebar]");
  const navigation = page.locator("#markos-primary-navigation");
  const geometry = await navigation.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
      controls: [...element.querySelectorAll("a")].map((control) => {
        const rect = control.getBoundingClientRect();
        return { width: rect.width, height: rect.height, withinNav: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 };
      })
    };
  });
  expect(geometry.hasHorizontalOverflow).toBe(false);
  for (const control of geometry.controls) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.withinNav).toBe(true);
  }
  const toggle = sidebar.getByRole("button", { name: rtl ? "توسيع الشريط الجانبي" : "Expand sidebar", exact: true });
  expect(
    await toggle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width >= 44 && rect.height >= 44 && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button") === element
      );
    })
  ).toBe(true);
  await navigation.getByRole("link").first().focus();
  const tooltip = page.locator('[data-sidebar-tooltip="dashboard"]');
  await tooltip.waitFor({ state: "visible" });
  const sidebarBox = (await sidebar.boundingBox())!;
  expect(sidebarBox.width).toBeCloseTo(96, 0);
  const tooltipBox = (await tooltip.boundingBox())!;
  expect(rtl ? tooltipBox.x + tooltipBox.width <= sidebarBox.x : tooltipBox.x >= sidebarBox.x + sidebarBox.width).toBe(true);
  expect(await navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await tooltip.waitFor({ state: "detached" });
  await toggle.focus();
  await navigation.getByRole("link").first().hover();
  await tooltip.hover();
  await page.waitForTimeout(220);
  expect(await tooltip.isVisible()).toBe(true);
  await page.keyboard.press("Escape");
  await tooltip.waitFor({ state: "detached" });
}

describe("site appearance controls", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("keeps workspace appearance in Settings and preserves it across shell collapse, locale and mobile navigation", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    const session = {
      mfaVerified: true,
      mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
      tokens: { accessToken: "theme-settings-fixture", expiresIn: 900 },
      user: { id: "appearance-owner", email: "owner@theme.test", fullName: "Theme Owner", locale: "en", isVerified: true },
      workspace: { id: "appearance-workspace", name: "Theme Workspace", slug: "theme-workspace" },
      roles: ["OWNER"]
    };
    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
      user: session.user,
      workspace: session.workspace,
      roles: session.roles
    });
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (pathname === "/v1/auth/refresh") data = session;
      else if (pathname === "/v1/onboarding") data = { status: "COMPLETE", businessProfile: { status: "APPROVED" } };
      else if (pathname === "/v1/workspace/instagram") data = { connected: false, status: "DISCONNECTED", recentMedia: [] };
      else if (pathname === "/v1/billing/summary") data = { invoices: [], payments: [] };
      else if (pathname === "/v1/auth/mfa/totp") data = { enabled: true };
      else if (pathname === "/v1/vault/score") data = { score: 0, entryCount: 0, completedSections: [], requiredSections: [], missingSections: [] };
      else if (pathname === "/v1/analytics") data = { totals: {}, daily: [], topContent: [], records: [] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    });
    try {
      await page.goto(`${baseUrl}/en/app`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Welcome back, Theme" }).waitFor();
      expect(await page.getByRole("combobox", { name: "Appearance", exact: true }).count()).toBe(0);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await page.getByRole("link", { name: "Appearance", exact: true }).click();
      await page.getByRole("heading", { name: "Appearance", exact: true }).waitFor();
      const darkRadio = page.getByRole("radio", { name: "Dark", exact: true });
      await darkRadio.focus();
      await darkRadio.press("Space");
      await expect.poll(() => darkRadio.isChecked()).toBe(true);
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
      await page.reload({ waitUntil: "networkidle" });
      await expect.poll(() => darkRadio.isChecked()).toBe(true);
      expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "settings-appearance-en-dark.png"), fullPage: true });

      await page.getByRole("link", { name: "Back to workspace", exact: true }).click();
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      await expect.poll(() => page.locator("[data-sidebar-collapsed]").getAttribute("data-sidebar-collapsed")).toBe("true");
      await assertCollapsedSidebar(page);
      expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
      await assertPlexFonts(page, ["h1", ".sunlit-primary", ".sunlit-panel-soft p"]);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "sidebar-collapsed-en-dark.png"), fullPage: true });
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      await page.getByRole("button", { name: /Change language\. Current language:/ }).click();
      await page.waitForURL(`${baseUrl}/ar/app`);
      await page.setViewportSize({ width: 1366, height: 600 });
      await page.getByRole("button", { name: "طي الشريط الجانبي", exact: true }).click();
      await expect.poll(() => page.locator("[data-sidebar-collapsed]").getAttribute("data-sidebar-collapsed")).toBe("true");
      await assertCollapsedSidebar(page, true);
      await assertPlexFonts(page, ["h1", ".sunlit-primary", ".sunlit-panel-soft p"]);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "sidebar-collapsed-ar-dark.png"), fullPage: true });
      await page.getByRole("button", { name: "توسيع الشريط الجانبي", exact: true }).click();
      await page.getByRole("link", { name: "الإعدادات", exact: true }).click();
      await page.getByRole("link", { name: "المظهر", exact: true }).click();
      await expect.poll(() => page.getByRole("radio", { name: "داكن", exact: true }).isChecked()).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      const systemRadio = page.getByRole("radio", { name: "النظام", exact: true });
      await systemRadio.focus();
      await systemRadio.press("Space");
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("light");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "settings-appearance-ar-mobile.png"), fullPage: true });
    } finally {
      await context.close();
    }
  });

  it("switches with the keyboard, persists on refresh and locale navigation, and follows system appearance when selected", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text())) hydrationErrors.push(message.text());
    });

    try {
      await page.goto(`${baseUrl}/en`, { waitUntil: "networkidle" });
      const appearance = page.getByRole("combobox", { name: "Appearance", exact: true });
      await appearance.selectOption("light");
      expect(await readPalette(page)).toEqual({ text: "#20212b", background: "#f7fafa", primary: "#d88fa3", secondary: "#81d8d0", accent: "#6c3ce8" });
      expect(await primaryButtonContrast(page)).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "landing-en-light-desktop.png"), fullPage: true });
      await appearance.focus();
      await appearance.press("ArrowDown");
      await appearance.press("Enter");
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
      expect(await appearance.inputValue()).toBe("dark");
      expect(await readPalette(page)).toEqual({ text: "#f2faf7", background: "#151821", primary: "#8fe3da", secondary: "#7b6af0", accent: "#d9a0b1" });
      expect(await primaryButtonContrast(page)).toBeGreaterThanOrEqual(4.5);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "landing-en-dark-desktop.png"), fullPage: true });

      await page.reload({ waitUntil: "networkidle" });
      expect(await appearance.inputValue()).toBe("dark");
      expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");

      await page.getByRole("link", { name: "العربية", exact: true }).first().click();
      const arabicAppearance = page.getByRole("combobox", { name: "المظهر", exact: true });
      await arabicAppearance.waitFor();
      await expect.poll(() => arabicAppearance.inputValue()).toBe("dark");
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "landing-ar-dark-desktop.png"), fullPage: true });
      await arabicAppearance.selectOption("system");
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("light");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");

      await page.setViewportSize({ width: 390, height: 844 });
      await arabicAppearance.selectOption("light");
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("light");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await arabicAppearance.selectOption("dark");
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "landing-ar-dark-mobile.png"), fullPage: true });
      expect(hydrationErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
