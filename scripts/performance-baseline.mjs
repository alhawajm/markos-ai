#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const defaultThresholds = {
  p50Ms: Number.parseInt(process.env.PERF_P50_MS ?? "250", 10),
  p95Ms: Number.parseInt(process.env.PERF_P95_MS ?? "750", 10),
  maxMs: Number.parseInt(process.env.PERF_MAX_MS ?? "2000", 10),
  errorRate: Number.parseFloat(process.env.PERF_ERROR_RATE ?? "0")
};

const iterations = Number.parseInt(process.env.PERF_ITERATIONS ?? "20", 10);
const warmupIterations = Number.parseInt(process.env.PERF_WARMUP_ITERATIONS ?? "3", 10);
const timeoutMs = Number.parseInt(process.env.PERF_TIMEOUT_MS ?? "5000", 10);

const apiBaseUrl = trimTrailingSlash(process.env.API_BASE_URL ?? "http://127.0.0.1:4000");
const webBaseUrl = trimTrailingSlash(process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000");

const checks = [
  {
    name: "api health",
    url: `${apiBaseUrl}/v1/health`,
    thresholds: defaultThresholds
  },
  {
    name: "api deep health",
    url: `${apiBaseUrl}/v1/health/deep`,
    thresholds: {
      ...defaultThresholds,
      p95Ms: Number.parseInt(process.env.PERF_DEEP_HEALTH_P95_MS ?? "1500", 10),
      maxMs: Number.parseInt(process.env.PERF_DEEP_HEALTH_MAX_MS ?? "4000", 10)
    }
  },
  {
    name: "web english shell",
    url: `${webBaseUrl}/en`,
    thresholds: defaultThresholds
  },
  {
    name: "web arabic shell",
    url: `${webBaseUrl}/ar`,
    thresholds: defaultThresholds
  }
];

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

const results = [];

for (const check of checks) {
  await warmup(check);
  results.push(await measure(check));
}

const failed = results.filter((result) => result.failed.length > 0);

console.log(JSON.stringify({ iterations, warmupIterations, timeoutMs, results }, null, 2));

if (failed.length > 0) {
  console.error(`Performance baseline failed for ${failed.map((result) => result.name).join(", ")}`);
  process.exit(1);
}

function printHelp() {
  console.log(`MARKOS performance baseline

Required running services:
  API at API_BASE_URL, default http://127.0.0.1:4000
  Web at WEB_BASE_URL, default http://127.0.0.1:3000

Environment knobs:
  PERF_ITERATIONS=20
  PERF_WARMUP_ITERATIONS=3
  PERF_TIMEOUT_MS=5000
  PERF_P50_MS=250
  PERF_P95_MS=750
  PERF_MAX_MS=2000
  PERF_DEEP_HEALTH_P95_MS=1500
  PERF_DEEP_HEALTH_MAX_MS=4000
  PERF_ERROR_RATE=0
`);
}

async function warmup(check) {
  for (let index = 0; index < warmupIterations; index += 1) {
    await timedFetch(check.url).catch(() => undefined);
  }
}

async function measure(check) {
  const samples = [];

  for (let index = 0; index < iterations; index += 1) {
    samples.push(await timedFetch(check.url));
  }

  const sortedDurations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const failures = samples.filter((sample) => sample.status < 200 || sample.status >= 400 || sample.error !== undefined);
  const summary = {
    name: check.name,
    url: check.url,
    requests: samples.length,
    errors: failures.length,
    errorRate: failures.length / samples.length,
    p50Ms: percentile(sortedDurations, 50),
    p95Ms: percentile(sortedDurations, 95),
    maxMs: sortedDurations.at(-1) ?? 0,
    thresholds: check.thresholds,
    failed: []
  };

  if (summary.errorRate > check.thresholds.errorRate) {
    summary.failed.push(`errorRate ${summary.errorRate} > ${check.thresholds.errorRate}`);
  }

  if (summary.p50Ms > check.thresholds.p50Ms) {
    summary.failed.push(`p50Ms ${summary.p50Ms} > ${check.thresholds.p50Ms}`);
  }

  if (summary.p95Ms > check.thresholds.p95Ms) {
    summary.failed.push(`p95Ms ${summary.p95Ms} > ${check.thresholds.p95Ms}`);
  }

  if (summary.maxMs > check.thresholds.maxMs) {
    summary.failed.push(`maxMs ${summary.maxMs} > ${check.thresholds.maxMs}`);
  }

  return summary;
}

async function timedFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });

    await response.arrayBuffer();

    return {
      durationMs: Math.round(performance.now() - startedAt),
      status: response.status
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      status: 0,
      error: error instanceof Error ? error.message : "Unknown request failure"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
