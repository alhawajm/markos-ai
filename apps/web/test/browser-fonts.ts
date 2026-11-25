import type { Page } from "playwright-core";
import { expect } from "vitest";

export const assertPlexFonts = (page: Page, selectors: string[]) => assertPlatformFonts(page, selectors, /^IBM Plex Sans/);
export const assertRobotoFonts = (page: Page, selectors: string[]) => assertPlatformFonts(page, selectors, /^Roboto\b/);

/** Verify rendered glyphs before treating a screenshot as typography evidence. */
async function assertPlatformFonts(page: Page, selectors: string[], family: RegExp) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    for (const selector of selectors) {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      expect(nodeId, `Font sample exists: ${selector}`).toBeGreaterThan(0);
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(
        fonts.some((font) => font.isCustomFont && family.test(font.familyName)),
        `Glyphs from ${family.source}: ${selector}`
      ).toBe(true);
      expect(
        fonts.some((font) => /Times New Roman/.test(font.familyName)),
        `No serif fallback: ${selector}`
      ).toBe(false);
    }
  } finally {
    await cdp.detach();
  }
}
