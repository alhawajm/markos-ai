# Performance NFR Baseline

This runbook closes the first M6 performance-work gate by creating a repeatable baseline check for release candidates. It does not close the load-test gate; concurrency, soak, and stress testing remain separate work.

## Baseline Command

Start the API and web services, then run:

```bash
corepack pnpm perf:baseline
```

Defaults:

- API base URL: `http://127.0.0.1:4000`
- Web base URL: `http://127.0.0.1:3000`
- Iterations: `20`
- Warmup iterations: `3`

Override targets when running against staging:

```bash
API_BASE_URL=https://api.staging.markos.ai \
WEB_BASE_URL=https://staging.markos.ai \
corepack pnpm perf:baseline
```

PowerShell:

```powershell
$env:API_BASE_URL="https://api.staging.markos.ai"
$env:WEB_BASE_URL="https://staging.markos.ai"
corepack pnpm perf:baseline
```

## Covered Checks

The baseline measures:

- `/v1/health`
- `/v1/health/deep`
- `/en`
- `/ar`

These endpoints cover the public app shell, localized routing, API liveness, and dependency liveness. They are intentionally low-risk enough to run against staging release candidates.

## Default Thresholds

| Metric | Default |
| --- | ---: |
| p50 latency | 250 ms |
| p95 latency | 750 ms |
| max latency | 2000 ms |
| error rate | 0 |
| deep-health p95 latency | 1500 ms |
| deep-health max latency | 4000 ms |

Threshold environment variables:

- `PERF_P50_MS`
- `PERF_P95_MS`
- `PERF_MAX_MS`
- `PERF_DEEP_HEALTH_P95_MS`
- `PERF_DEEP_HEALTH_MAX_MS`
- `PERF_ERROR_RATE`
- `PERF_ITERATIONS`
- `PERF_WARMUP_ITERATIONS`
- `PERF_TIMEOUT_MS`

## Release Candidate Evidence

For each release candidate, save:

- Command used.
- Commit SHA.
- Environment name.
- JSON output.
- Any threshold override and reason.
- Follow-up issue for every failed threshold.

## Pass Criteria

The baseline passes only when every measured endpoint has:

- HTTP 2xx or 3xx responses for every measured request.
- Error rate at or below the configured threshold.
- p50, p95, and max latency at or below the configured thresholds.

## Known Limits

This baseline does not prove:

- Concurrent user capacity.
- AI generation throughput.
- Instagram publish throughput.
- Billing callback throughput.
- Database saturation behavior.
- Worker backlog recovery.

Those remain under the M6 load-test gate.
