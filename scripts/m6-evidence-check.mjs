#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const init = process.argv.includes("--init");
const requestedDate = readArg("--date") ?? process.env.M6_EVIDENCE_DATE ?? today();
const evidenceRoot = join(root, "evidence", "m6");
const templateRoot = join(evidenceRoot, "templates");

const gates = [
  {
    description: "verify, build, performance, load, security, and RTL outputs",
    name: "build",
    requiredItems: ["verify output", "build output", "performance baseline", "load test", "security audit", "RTL QA"]
  },
  {
    description: "live staging deploy URL, release SHA, and smoke output",
    name: "staging",
    requiredItems: ["deploy URL", "release SHA", "staging smoke report", "cloud deploy status"]
  },
  {
    description: "Meta App Review submission or approval evidence",
    name: "meta-app-review",
    requiredItems: ["submission screenshot/export", "requested permissions/features", "status or approval evidence"]
  },
  {
    description: "real image post and reel publish proof",
    name: "instagram-publishing",
    requiredItems: ["image post Graph response", "image post proof link/screenshot", "reel Graph response", "reel proof link/screenshot"]
  },
  {
    description: "live analytics sync and real metrics proof",
    name: "instagram-analytics",
    requiredItems: ["live readiness response", "sync response", "real metrics screenshot/export", "Vault learning evidence"]
  },
  {
    description: "CrediMax or BENEFIT live credential, webhook, checkout, and invoice proof",
    name: "payments",
    requiredItems: ["gateway certification/credential proof", "webhook proof", "live checkout proof", "paid invoice proof"]
  },
  {
    description: "paid invoice VAT compliance report and legal wording approval",
    name: "vat-compliance",
    requiredItems: ["VAT compliance report", "seller VAT/legal wording approval", "paid invoice reference"]
  },
  {
    description: "release owner, technical owner, and compliance owner sign-off",
    name: "launch-signoff",
    requiredItems: ["completed launch signoff", "go/no-go decision", "owner approvals"]
  }
];

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

if (init) {
  initializeEvidencePack(requestedDate);
}

const dates = readArg("--date") || process.env.M6_EVIDENCE_DATE || init ? [requestedDate] : listEvidenceDates();
const latestDate = dates.at(-1);

if (!latestDate) {
  console.log("M6 evidence report: no dated evidence folders found.");
  printGateSummary(gates.map((gate) => gateResult(gate, undefined)));
  maybeFail(gates.map((gate) => gateResult(gate, undefined)));
  process.exit(0);
}

const gateResults = gates.map((gate) => gateResult(gate, latestDate));
const leakResults = scanForSensitiveText(latestDate);

console.log(`M6 evidence report for ${latestDate}`);
printGateSummary(gateResults);
printLeakSummary(leakResults);

const missingRequired = gateResults.filter((gate) => !gate.ready);

if (missingRequired.length > 0) {
  console.log(`Missing or incomplete M6 evidence gates: ${missingRequired.map((gate) => gate.name).join(", ")}`);
}

if (strict && (missingRequired.length > 0 || leakResults.length > 0)) {
  console.error("M6 evidence strict check failed.");
  process.exit(1);
}

function initializeEvidencePack(date) {
  const datedRoot = join(evidenceRoot, date);
  mkdirSync(datedRoot, { recursive: true });

  for (const gate of gates) {
    const gateDir = join(datedRoot, gate.name);
    mkdirSync(gateDir, { recursive: true });

    if (gate.name === "launch-signoff") {
      copyTemplateIfMissing("launch-signoff.md", join(gateDir, "launch-signoff.md"));
    }

    const manifestPath = join(gateDir, "artifact-manifest.md");
    if (!existsSync(manifestPath)) {
      const template = readFileSync(join(templateRoot, "artifact-manifest.md"), "utf8");
      const requiredRows = gate.requiredItems.map((item) => `| ${item} |  | No | Pending |`).join("\n");
      const seeded = template
        .replace("Gate:\n", `Gate: ${gate.name}\n`)
        .replace("Date:\n", `Date: ${date}\n`)
        .replace("Environment:\n", "Environment: staging/live-provider-verification\n")
        .replace("|  |  |  |  |", requiredRows);
      writeFileSync(manifestPath, seeded);
    }
  }

  console.log(`Initialized M6 evidence pack at ${relative(root, datedRoot)}`);
}

function copyTemplateIfMissing(templateName, targetPath) {
  if (!existsSync(targetPath)) {
    copyFileSync(join(templateRoot, templateName), targetPath);
  }
}

function gateResult(gate, date) {
  const gateDir = date ? join(evidenceRoot, date, gate.name) : "";
  const files = gateDir && existsSync(gateDir) ? listFiles(gateDir) : [];
  const proofFiles = files.filter((file) => !isTemplateOnlyFile(file));
  const manifest = files.find((file) => basename(file).toLowerCase() === "artifact-manifest.md");
  const signoff = gate.name === "launch-signoff" ? files.find((file) => basename(file).toLowerCase() === "launch-signoff.md") : undefined;
  const manifestStatus = manifest ? readManifestStatus(join(root, manifest)) : "Missing";
  const signoffDecision = signoff ? readSignoffDecision(join(root, signoff)) : undefined;
  const ready =
    proofFiles.length > 0 &&
    Boolean(manifest) &&
    manifestStatus !== "Pending" &&
    manifestStatus !== "Missing" &&
    (gate.name !== "launch-signoff" || signoffDecision === "Go");

  return {
    ...gate,
    files,
    manifestStatus,
    proofFiles,
    ready,
    signoffDecision
  };
}

function printHelp() {
  console.log(`MARKOS M6 evidence report

Usage:
  corepack pnpm evidence:m6
  corepack pnpm evidence:m6 -- --init
  corepack pnpm evidence:m6 -- --date 2026-06-17
  corepack pnpm evidence:m6 -- --strict

The report scans ignored local evidence folders under:
  evidence/m6/<yyyy-mm-dd>/<gate>/

Strict mode exits non-zero until every gate has:
  - an artifact-manifest.md with Status not Pending
  - at least one proof artifact beyond templates/manifests
  - launch-signoff/launch-signoff.md with Final decision: Go
  - no obvious unredacted secrets in text artifacts
`);
}

function printGateSummary(results) {
  for (const gate of results) {
    const marker = gate.ready ? "READY" : gate.proofFiles.length > 0 ? "PARTIAL" : "MISSING";
    console.log(`${marker} ${gate.name}: ${gate.description}`);
    console.log(`  manifest: ${gate.manifestStatus}`);

    if (gate.signoffDecision) {
      console.log(`  signoff: ${gate.signoffDecision}`);
    }

    console.log(`  required proof: ${gate.requiredItems.join("; ")}`);

    for (const file of gate.files ?? []) {
      console.log(`  - ${file}`);
    }
  }
}

function printLeakSummary(leakResults) {
  if (leakResults.length === 0) {
    console.log("Secret scan: no obvious unredacted text secrets found.");
    return;
  }

  console.log("Secret scan warnings:");
  for (const leak of leakResults) {
    console.log(`  - ${leak.file}: ${leak.label}`);
  }
}

function maybeFail(results) {
  if (strict && results.some((gate) => !gate.ready)) {
    console.error("M6 evidence strict check failed.");
    process.exit(1);
  }
}

function readArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function listEvidenceDates() {
  if (!existsSync(evidenceRoot)) {
    return [];
  }

  return readdirSync(evidenceRoot)
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    .filter((entry) => statSync(join(evidenceRoot, entry)).isDirectory())
    .sort();
}

function listFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(dir, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...listFiles(absolutePath));
      continue;
    }

    files.push(relative(root, absolutePath));
  }

  return files.sort();
}

function isTemplateOnlyFile(file) {
  const name = basename(file).toLowerCase();
  return name === "artifact-manifest.md" || name === "launch-signoff.md" || name === "readme.md" || name === ".gitkeep";
}

function readManifestStatus(file) {
  if (!existsSync(file)) {
    return "Missing";
  }

  const content = readFileSync(file, "utf8");
  const match = content.match(/^Status:\s*(.+)$/im);
  return match?.[1]?.trim() || "Missing";
}

function readSignoffDecision(file) {
  if (!existsSync(file)) {
    return undefined;
  }

  const content = readFileSync(file, "utf8");
  const match = content.match(/^Final decision:\s*(.+)$/im);
  return match?.[1]?.trim();
}

function scanForSensitiveText(date) {
  const datedRoot = join(evidenceRoot, date);
  if (!existsSync(datedRoot)) {
    return [];
  }

  const textExtensions = new Set([".csv", ".json", ".log", ".md", ".txt", ".xml", ".yaml", ".yml"]);
  const patterns = [
    { label: "access token", pattern: /\b(access_token|refresh_token|id_token)\b\s*[:=]/i },
    { label: "API/client secret", pattern: /\b(api[_-]?key|client[_-]?secret|webhook[_-]?secret|app[_-]?secret)\b\s*[:=]/i },
    { label: "bearer token", pattern: /\bbearer\s+[a-z0-9._~+/=-]{20,}/i },
    { label: "payment card number", pattern: /\b(?:\d[ -]*?){13,19}\b/ }
  ];
  const leaks = [];

  for (const relativeFile of listFiles(datedRoot)) {
    const absoluteFile = join(root, relativeFile);
    const stats = statSync(absoluteFile);
    const extension = extname(absoluteFile).toLowerCase();

    if (!textExtensions.has(extension) || stats.size > 1024 * 1024) {
      continue;
    }

    const content = readFileSync(absoluteFile, "utf8");
    for (const check of patterns) {
      if (check.pattern.test(content)) {
        leaks.push({ file: relativeFile, label: check.label });
      }
    }
  }

  return leaks;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
