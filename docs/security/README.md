# Security preparation — 26 October 2026

The initial production dependency scan reported 7 critical, 41 high, 19 moderate
and 3 low advisories. Updated the existing major versions, including Next.js
16.4.3, Sentry 10.76.2 and API Zod 4.6.7; PostCSS is pinned to 8.5.31 and Prisma's
configuration merge dependency to deepmerge-ts 8.0.2. Native React remains at the
Expo/React Native-supported version; do not force a mismatched renderer.

Three legacy Expo toolchain findings require source patches while their package
version numbers remain in the advisory ranges. `backports.json` records the exact
patch hashes, regression test and review deadline. `security:audit` keeps these
findings visible, verifies the applied lockfile patch and hash, and rejects unknown,
unpatched or expired exceptions. It never describes a patched version number as an
official upstream release. Refresh the backports when upstream fixes are released.

- node-forge: backport the nested DigestAlgorithm element-count validation from
  [upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152), which was still
  open and unreleased when checked. The regression verifies valid RSA signatures
  still work and signatures with nested extra data are rejected.
- Zod 3: cap diagnostic issue allocation across nested parse contexts in the legacy
  Expo CLI. This is a local mitigation, not an official Zod 3 release. The application
  API uses the patched Zod 4 version. Regression tests exercise large invalid arrays,
  nested unions and normal successful validation.
- decode-uri-component: preserve malformed URI data instead of invoking the
  exponential fallback decoder. Normal UTF-8 and plus-separated decoding is retained;
  malformed-input recovery semantics deliberately become conservative.

Error-monitoring and HTTP/worker logging changes remove raw exception messages,
request URLs/query strings, credentials, headers, business documents, prompts and
frame locals from retained telemetry. Classified error codes and code locations
remain. Arbitrary tracing payloads are not sent.

Focused tests and dependency scans are engineering evidence, not a penetration-test
certificate or proof of provider approval. The public launch checklist must retain
real-device, tenant-isolation, live-provider and restoration acceptance separately.

The Python runtime is now exported from `uv.lock` into `services/ai/requirements.lock`
with pinned versions and hashes. The deployment image installs that graph with
`--require-hashes --no-deps`. The first refreshed audit found 37 advisories in Pillow
12.3.0; upgrading to Pillow 13.0.0 cleared those findings. The final pinned runtime
scan returned no known vulnerabilities. See [Pillow's security release notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html).

Release testing also exposed missing application-role policies on five newer
workspace tables and a missing campaign-table grant after its earlier replacement.
Forward migrations add those policies/grants. Isolation coverage now includes all
42 workspace-owned Prisma models and tests reads using the restricted application
role. The first successful recovery snapshot precedes these two forward migrations.
