# Load Test

Status date: 2026-08-16.

This runbook defines the M6 repeatable public-readiness load scenario. A previous passing run does not close the gate for a new release candidate. The scenario is designed to be safe against local and staging environments because it only exercises read-only API and localized public routes.

## Command

Start the API and web services, then run:

```bash
corepack pnpm load:test
```

Defaults:

- Duration: `30` seconds
- Concurrency: `8`
- API base URL: `http://127.0.0.1:4000`
- Web base URL: `http://127.0.0.1:3000`

Run against staging:

```bash
API_BASE_URL=https://api.staging.markos.ai \
WEB_BASE_URL=https://staging.markos.ai \
LOAD_DURATION_SECONDS=300 \
LOAD_CONCURRENCY=25 \
corepack pnpm load:test
```

PowerShell:

```powershell
$env:API_BASE_URL="https://api.staging.markos.ai"
$env:WEB_BASE_URL="https://staging.markos.ai"
$env:LOAD_DURATION_SECONDS="300"
$env:LOAD_CONCURRENCY="25"
corepack pnpm load:test
```

## Scenario

Default scenario: `public-readiness`

Weighted requests:

| Request | Weight |
| --- | ---: |
| `GET /v1/health` | 3 |
| `GET /v1/health/deep` | 1 |
| `GET /en` | 3 |
| `GET /ar` | 3 |

This mix keeps dependency checks in the load profile without letting deep health dominate the run.

## Default Thresholds

| Threshold | Default |
| --- | ---: |
| Error rate | `0` |
| Minimum throughput | `10` requests/second |
| p95 latency | `1000` ms |
| max latency | `3000` ms |

Configurable environment variables:

- `LOAD_DURATION_SECONDS`
- `LOAD_CONCURRENCY`
- `LOAD_TIMEOUT_MS`
- `LOAD_ERROR_RATE`
- `LOAD_MIN_RPS`
- `LOAD_P95_MS`
- `LOAD_MAX_MS`
- `LOAD_SCENARIO_NAME`

## Evidence To Save

For each release candidate or staging test, save:

- Command used.
- Commit SHA.
- Environment name.
- Duration and concurrency.
- JSON output.
- Any threshold override and reason.
- Follow-up issue for every failed threshold.

## Pass Criteria

The load test passes only when:

- All measured requests return HTTP 2xx or 3xx within the configured timeout.
- Aggregate error rate is at or below `LOAD_ERROR_RATE`.
- Aggregate throughput is at or above `LOAD_MIN_RPS`.
- Aggregate p95 latency is at or below `LOAD_P95_MS`.
- Aggregate max latency is at or below `LOAD_MAX_MS`.

## Known Limits

This load test intentionally avoids mutating state. It does not prove:

- AI generation throughput under concurrent tenant usage.
- Instagram publishing queue throughput.
- Analytics sync throughput.
- Payment callback throughput.
- Long soak behavior under worker backlog.

Those should be added as separate scenario scripts after staging provider credentials and representative beta traffic are available.
