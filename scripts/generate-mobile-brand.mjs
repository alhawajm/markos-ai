// Render the existing MARKOS wand icon and Sunlit colors into native launch assets.
// Uses the installed Lucide icon (ISC), keeping web and native branding consistent.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "apps/web/package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { WandSparkles } = require("lucide-react");
const output = path.join(root, "apps/mobile/assets");
const icon = (size) => renderToStaticMarkup(React.createElement(WandSparkles, { width: size, height: size, stroke: "#20212b", strokeWidth: 1.7 }));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
});
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  for (const [name, background, size] of [
    ["icon", "#d88fa3", 550],
    ["adaptive-icon", "transparent", 432],
    ["splash", "transparent", 432]
  ]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${background === "transparent" ? "none" : background}"/>${name === "splash" ? '<rect x="164" y="164" width="696" height="696" rx="180" fill="#d88fa3"/>' : ""}<g transform="translate(${(1024 - size) / 2} ${(1024 - size) / 2})">${icon(size)}</g></svg>`;
    await writeFile(path.join(output, `${name}.svg`), svg);
    await page.setContent(`<style>html,body{margin:0;width:1024px;height:1024px;background:transparent}</style>${svg}`);
    await page.screenshot({ path: path.join(output, `${name}.png`), omitBackground: background === "transparent" });
  }
} finally {
  await browser.close();
}
console.log("Rendered MARKOS icon, Android foreground and splash assets.");
