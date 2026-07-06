#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const durationSeconds = readInt("LOAD_DURATION_SECONDS", 30);
const concurrency = readInt("LOAD_CONCURRENCY", 8);
const timeoutMs = readInt("LOAD_TIMEOUT_MS", 5000);
const maxErrorRate = readFloat("LOAD_ERROR_RATE", 0);
const minRequestsPerSecond = readFloat("LOAD_MIN_RPS", 10);
const p95ThresholdMs = readInt("LOAD_P95_MS", 1000);
const maxThresholdMs = readInt("LOAD_MAX_MS", 3000);

const apiBaseUrl = trimTrailingSlash(process.env.API_BASE_URL ?? "http://127.0.0.1:4000");
const webBaseUrl = trimTrailingSlash(process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000");

const scenario = {
  name: process.env.LOAD_SCENARIO_NAME ?? "public-readiness",
  requests: [
    { name: "api health", method: "GET", url: `${apiBaseUrl}/v1/health`, weight: 3 },
    { name: "api deep health", method: "GET", url: `${apiBaseUrl}/v1/health/deep`, weight: 1 },
    { name: "web english shell", method: "GET", url: `${webBaseUrl}/en`, weight: 3 },
    { name: "web arabic shell", method: "GET", url: `${webBaseUrl}/ar`, weight: 3 }
  ]
};

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

const weightedRequests = expandWeightedRequests(scenario.requests);
const startedAt = performance.now();
const endsAt = startedAt + durationSeconds * 1000;
const samples = [];

await Promise.all(
  Array.from({ length: concurrency }, async (_, workerIndex) => {
    let requestIndex = workerIndex;

    while (performance.now() < endsAt) {
      const request = weightedRequests[requestIndex % weightedRequests.length];
      samples.push(await timedFetch(request));
      requestIndex += concurrency;
    }
  })
);

const elapsedSeconds = (performance.now() - startedAt) / 1000;
const result = summarize(samples, elapsedSeconds);

console.log(
  JSON.stringify(
    {
      scenario: scenario.name,
      durationSeconds,
      elapsedSeconds: round(elapsedSeconds),
      concurrency,
      timeoutMs,
      thresholds: {
        maxErrorRate,
        minRequestsPerSecond,
        p95ThresholdMs,
        maxThresholdMs
      },
      result
    },
    null,
    2
  )
);

if (result.failed.length > 0) {
  console.error(`Load test failed: ${result.failed.join("; ")}`);
  process.exit(1);
}

function printHelp() {
  console.log(`MARKOS load test

Required running services:
  API at API_BASE_URL, default http://127.0.0.1:4000
  Web at WEB_BASE_URL, default http://127.0.0.1:3000

Environment knobs:
  LOAD_DURATION_SECONDS=30
  LOAD_CONCURRENCY=8
  LOAD_TIMEOUT_MS=5000
  LOAD_ERROR_RATE=0
  LOAD_MIN_RPS=10
  LOAD_P95_MS=1000
  LOAD_MAX_MS=3000
  LOAD_SCENARIO_NAME=public-readiness
`);
}

async function timedFetch(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(request.url, {
      cache: "no-store",
      method: request.method,
      signal: controller.signal
    });

    await response.arrayBuffer();

    return {
      durationMs: Math.round(performance.now() - started),
      method: request.method,
      name: request.name,
      status: response.status,
      url: request.url
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Unknown request failure",
      method: request.method,
      name: request.name,
      status: 0,
      url: request.url
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(samples, elapsedSeconds) {
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const failures = samples.filter((sample) => sample.status < 200 || sample.status >= 400 || sample.error !== undefined);
  const requestsPerSecond = samples.length / elapsedSeconds;
  const byRequest = new Map();

  for (const sample of samples) {
    const current = byRequest.get(sample.name) ?? {
      errors: 0,
      maxMs: 0,
      requests: 0,
      totalMs: 0
    };
    current.requests += 1;
    current.totalMs += sample.durationMs;
    current.maxMs = Math.max(current.maxMs, sample.durationMs);
    current.errors += sample.status < 200 || sample.status >= 400 || sample.error !== undefined ? 1 : 0;
    byRequest.set(sample.name, current);
  }

  const result = {
    requests: samples.length,
    requestsPerSecond: round(requestsPerSecond),
    errors: failures.length,
    errorRate: round(failures.length / Math.max(samples.length, 1)),
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations.at(-1) ?? 0,
    byRequest: Object.fromEntries(
      [...byRequest.entries()].map(([name, entry]) => [
        name,
        {
          ...entry,
          averageMs: round(entry.totalMs / entry.requests),
          errorRate: round(entry.errors / entry.requests)
        }
      ])
    ),
    failed: []
  };

  if (result.errorRate > maxErrorRate) {
    result.failed.push(`errorRate ${result.errorRate} > ${maxErrorRate}`);
  }

  if (result.requestsPerSecond < minRequestsPerSecond) {
    result.failed.push(`requestsPerSecond ${result.requestsPerSecond} < ${minRequestsPerSecond}`);
  }

  if (result.p95Ms > p95ThresholdMs) {
    result.failed.push(`p95Ms ${result.p95Ms} > ${p95ThresholdMs}`);
  }

  if (result.maxMs > maxThresholdMs) {
    result.failed.push(`maxMs ${result.maxMs} > ${maxThresholdMs}`);
  }

  return result;
}

function expandWeightedRequests(requests) {
  return requests.flatMap((request) => Array.from({ length: request.weight }, () => request));
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function readFloat(key, fallback) {
  const value = Number.parseFloat(process.env[key] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function readInt(key, fallback) {
  const value = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
