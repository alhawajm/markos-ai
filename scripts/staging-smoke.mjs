#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const timeoutMs = Number.parseInt(process.env.STAGING_SMOKE_TIMEOUT_MS ?? "10000", 10);
const apiBaseUrl = readRequiredUrl("API_BASE_URL");
const webBaseUrl = readRequiredUrl("WEB_BASE_URL");
const evidenceDate = process.env.M6_EVIDENCE_DATE ?? new Date().toISOString().slice(0, 10);
const releaseSha = process.env.GITHUB_SHA ?? process.env.RELEASE_SHA ?? "local";
const allowLocalSmoke = process.env.ALLOW_LOCAL_STAGING_SMOKE === "true";
const outputDir = join(process.cwd(), "evidence", "m6", evidenceDate, "staging");
const outputPath = join(outputDir, "staging-smoke-report.json");

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

assertStagingUrl("API_BASE_URL", apiBaseUrl);
assertStagingUrl("WEB_BASE_URL", webBaseUrl);

const checks = [
  {
    name: "api-health",
    url: `${apiBaseUrl}/v1/health`,
    expectBodyIncludes: ["ok"]
  },
  {
    name: "api-deep-health",
    url: `${apiBaseUrl}/v1/health/deep`,
    expectBodyIncludes: ["status"]
  },
  {
    name: "web-arabic-shell",
    url: `${webBaseUrl}/ar`,
    expectBodyIncludes: ["MARKOS"]
  },
  {
    name: "web-english-shell",
    url: `${webBaseUrl}/en`,
    expectBodyIncludes: ["MARKOS"]
  }
];

const startedAt = new Date().toISOString();
const results = [];

for (const check of checks) {
  results.push(await runCheck(check));
}

const finishedAt = new Date().toISOString();
const failed = results.filter((result) => !result.passed);
const report = {
  gate: "staging",
  status: failed.length === 0 ? "passed" : "failed",
  releaseSha,
  apiBaseUrl: redactUrl(apiBaseUrl),
  webBaseUrl: redactUrl(webBaseUrl),
  startedAt,
  finishedAt,
  timeoutMs,
  results
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`Saved staging smoke evidence to ${outputPath}`);

if (failed.length > 0) {
  console.error(`Staging smoke failed for ${failed.map((result) => result.name).join(", ")}`);
  process.exit(1);
}

function printHelp() {
  console.log(`MARKOS staging smoke evidence

Required environment:
  API_BASE_URL=https://api.staging.example.com
  WEB_BASE_URL=https://staging.example.com

Optional environment:
  RELEASE_SHA=<commit-sha>
  ALLOW_LOCAL_STAGING_SMOKE=true
  M6_EVIDENCE_DATE=2026-06-14
  STAGING_SMOKE_TIMEOUT_MS=10000

Output:
  evidence/m6/<date>/staging/staging-smoke-report.json

The evidence folder is ignored by Git. Redact or remove anything sensitive before sharing artifacts.
`);
}

function readRequiredUrl(name) {
  const value = process.env[name];

  if (!value) {
    if (process.argv.includes("--help")) {
      return `https://${name.toLowerCase().replaceAll("_", "-")}.example.com`;
    }

    console.error(`${name} is required.`);
    process.exit(1);
  }

  return trimTrailingSlash(value);
}

function assertStagingUrl(name, value) {
  const hostname = new URL(value).hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!allowLocalSmoke && localHosts.has(hostname)) {
    console.error(`${name} points to ${hostname}. Set ALLOW_LOCAL_STAGING_SMOKE=true only for local script validation.`);
    process.exit(1);
  }
}

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(check.url, {
      cache: "no-store",
      headers: {
        accept: "application/json,text/html;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });
    const body = await response.text();
    const bodySample = body.slice(0, 500);
    const expectedBodyHits = check.expectBodyIncludes.map((expected) => ({
      expected,
      present: body.includes(expected)
    }));
    const passed = response.status >= 200 && response.status < 400 && expectedBodyHits.every((item) => item.present);

    return {
      name: check.name,
      url: redactUrl(check.url),
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      passed,
      expectedBodyHits,
      bodySample: redactText(bodySample)
    };
  } catch (error) {
    return {
      name: check.name,
      url: redactUrl(check.url),
      status: 0,
      durationMs: Math.round(performance.now() - started),
      passed: false,
      error: error instanceof Error ? error.message : "Unknown request failure"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function redactUrl(value) {
  return value.replace(/([?&](?:access_token|token|code|secret|key)=)[^&]+/gi, "$1[REDACTED]");
}

function redactText(value) {
  return value
    .replace(/"accessToken"\s*:\s*"[^"]+"/gi, '"accessToken":"[REDACTED]"')
    .replace(/"refreshToken"\s*:\s*"[^"]+"/gi, '"refreshToken":"[REDACTED]"')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[REDACTED]"')
    .replace(/"secret"\s*:\s*"[^"]+"/gi, '"secret":"[REDACTED]"');
}
