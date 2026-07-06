import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const checks = [];

function pass(name, details) {
  checks.push({ details, name, passed: true });
}

function fail(name, details) {
  checks.push({ details, name, passed: false });
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(path, expected, name) {
  const content = read(path);
  if (content.includes(expected)) {
    pass(name, `${path} contains ${expected}`);
  } else {
    fail(name, `${path} does not contain ${expected}`);
  }
}

function listFiles(dir, extensions) {
  const absoluteDir = join(root, dir);
  const entries = readdirSync(absoluteDir);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(absoluteDir, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (entry === ".next" || entry === "node_modules") {
        continue;
      }

      files.push(...listFiles(relative(root, absolutePath), extensions));
      continue;
    }

    if (extensions.some((extension) => entry.endsWith(extension))) {
      files.push(relative(root, absolutePath));
    }
  }

  return files;
}

assertIncludes("apps/web/app/[locale]/layout.tsx", "lang={locale}", "localized-layout-lang");
assertIncludes("apps/web/app/[locale]/layout.tsx", "dir={directionForLocale(locale)}", "localized-layout-dir");
assertIncludes("apps/web/app/[locale]/[section]/page.tsx", "[\"ar\", \"en\"]", "localized-section-static-params");
assertIncludes("apps/web/app/page.tsx", "redirect(\"/ar\")", "root-route-defaults-to-arabic");
assertIncludes("apps/web/app/layout.tsx", "<html lang=\"en\" dir=\"ltr\">", "root-html-neutral-default");
assertIncludes("packages/i18n/src/index.ts", "locale === \"ar\" ? \"rtl\" : \"ltr\"", "direction-helper");
assertIncludes("packages/i18n/src/index.ts", "\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645", "arabic-dashboard-copy");
assertIncludes("apps/web/app/[locale]/_components/app-shell.tsx", "localizedHref(\"ar\", activeSection)", "arabic-language-switch");
assertIncludes("apps/web/app/[locale]/_components/app-shell.tsx", "localizedHref(\"en\", activeSection)", "english-language-switch");

const mojibakePattern = /(?:Ã|Â|�|Ø|Ù|Ð|Ñ)/;
const scannedFiles = [
  ...listFiles("apps/web/app", [".ts", ".tsx"]),
  ...listFiles("packages/i18n/src", [".ts"])
];
const mojibakeHits = scannedFiles.filter((path) => mojibakePattern.test(read(path)));

if (mojibakeHits.length === 0) {
  pass("no-mojibake", `Scanned ${scannedFiles.length} web/i18n source files`);
} else {
  fail("no-mojibake", `Potential mojibake in ${mojibakeHits.join(", ")}`);
}

const failed = checks.filter((check) => !check.passed);

for (const check of checks) {
  const marker = check.passed ? "PASS" : "FAIL";
  console.log(`${marker} ${check.name}: ${check.details}`);
}

if (failed.length > 0) {
  console.error(`Arabic/RTL QA failed with ${failed.length} issue(s).`);
  process.exit(1);
}

console.log(`Arabic/RTL QA passed with ${checks.length} checks.`);
