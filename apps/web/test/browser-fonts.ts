import type { Page } from "playwright-core";
import { expect } from "vitest";

/** Verify rendered glyphs before treating a screenshot as typography evidence. */
export async function assertPlexFonts(page: Page, selectors: string[]) {
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
        fonts.some((font) => font.isCustomFont && /^IBM Plex Sans/.test(font.familyName)),
        `Plex glyphs: ${selector}`
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
