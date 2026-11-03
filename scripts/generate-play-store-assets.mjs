import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const mobileRequire = createRequire(path.join(root, "apps/mobile/package.json"));
const output = path.join(root, "apps/mobile/store/google-play");
const lightCss = (await readFile(path.join(root, "apps/web/app/theme-tokens.css"), "utf8")).split("}")[0];
const definitions = Object.fromEntries([...lightCss.matchAll(/--([\w-]+):\s*(#[\da-fA-F]{6}|var\(--[\w-]+\));/g)].map((match) => [match[1], match[2]]));
function color(name, visited = new Set()) {
  if (!definitions[name] || visited.has(name)) throw new Error(`Invalid store palette token: ${name}`);
  const reference = /^var\(--([\w-]+)\)$/.exec(definitions[name]);
  return reference ? color(reference[1], new Set([...visited, name])) : definitions[name];
}
const colors = Object.fromEntries(["background", "primary", "accent", "secondary", "text", "surface"].map((name) => [name, color(name)]));
colors.textSoft = color("text-soft");
const font = async (name, file) => (await readFile(mobileRequire.resolve(`@expo-google-fonts/${name}/600SemiBold/${file}`))).toString("base64");
const [latin, arabic, icon] = await Promise.all([
  font("ibm-plex-sans", "IBMPlexSans_600SemiBold.ttf"),
  font("ibm-plex-sans-arabic", "IBMPlexSansArabic_600SemiBold.ttf"),
  readFile(path.join(root, "apps/mobile/assets/icon.svg"), "utf8")
]);
const fonts = `<style>@font-face{font-family:Markos;src:url(data:font/ttf;base64,${latin})}@font-face{font-family:MarkosArabic;src:url(data:font/ttf;base64,${arabic})}html,body{margin:0;background:transparent}</style>`;
const graphic = (ar) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
<rect width="1024" height="500" fill="${colors.background}"/>
<circle cx="945" cy="60" r="260" fill="${colors.primary}"/>
<circle cx="1068" cy="502" r="245" fill="${colors.accent}"/>
<path d="M784 98c-67 80-27 166 54 170 98 4 120 69 58 137" fill="none" stroke="${colors.secondary}" stroke-width="3"/>
<g fill="${colors.text}" font-family="${ar ? "MarkosArabic" : "Markos"}" ${ar ? 'text-anchor="end"' : ""}>
<text x="${ar ? 706 : 80}" y="100" font-size="27" letter-spacing="${ar ? 0 : 3}">${ar ? "ماركوس" : "MARKOS"}</text>
<text x="${ar ? 706 : 80}" y="211" font-size="${ar ? 56 : 58}">${ar ? "من معرفة نشاطك" : "Your next campaign,"}</text>
<text x="${ar ? 706 : 80}" y="285" font-size="${ar ? 56 : 58}">${ar ? "إلى حملتك القادمة" : "all in one place."}</text>
<text x="${ar ? 706 : 80}" y="365" font-size="24" fill="${colors.textSoft}">${ar ? "خطّط. أنشئ. راجع. جدوِل." : "Plan. Create. Review. Schedule."}</text>
</g>
<g transform="translate(829 154)" fill="none" stroke="${colors.text}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
<rect width="92" height="112" rx="22" fill="${colors.surface}"/><path d="M24 37h44M24 56h33M24 75h21"/>
<circle cx="80" cy="99" r="26" fill="${colors.accent}"/><path d="m68 99 8 8 16-18"/>
</g></svg>`;

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
});
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`${fonts}<div style="width:512px;height:512px">${icon.replace('width="1024" height="1024"', 'width="512" height="512"')}</div>`);
  await page.screenshot({ path: path.join(output, "icon.png"), omitBackground: true });
  await page.setViewportSize({ width: 1024, height: 500 });
  for (const locale of ["en-US", "ar"]) {
    const svg = graphic(locale === "ar");
    await writeFile(path.join(output, `feature-${locale}.svg`), svg);
    await page.setContent(`${fonts}${svg}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, `feature-${locale}.jpg`), type: "jpeg", quality: 96 });
  }
} finally {
  await browser.close();
}
console.log("Generated MARKOS Play icon and English/Arabic feature graphics. No app screenshots are simulated.");
