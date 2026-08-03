# OWASP Security Audit

This runbook closes the M6 internal OWASP security audit gate for the current codebase. It records the controls, commands, evidence, and residual launch checks that must stay visible.

## Audit Command

Run:

```bash
corepack pnpm security:audit
```

This runs `pnpm audit --audit-level moderate` across the workspace. The audit must return `No known vulnerabilities found`.

## Latest Result

Result on the current release candidate:

- Initial audit found vulnerable transitive `esbuild@0.28.0` and `postcss@8.4.31`.
- `pnpm-workspace.yaml` now overrides:
  - `esbuild: 0.28.1`
  - `postcss: 8.5.15`
- `corepack pnpm audit` returns `No known vulnerabilities found`.

## OWASP Top 10 Control Map

| OWASP area                                     | MARKOS control                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control                      | Workspace middleware resolves active workspace and user roles; route configs require named permissions; workspace isolation tests cover every Prisma model with `workspaceId`; RLS policies fail closed without `app.current_workspace`.                                                                                                                                                                  |
| A02 Cryptographic Failures                     | Passwords use Argon2id; JWT access and refresh secrets are environment-controlled; refresh tokens rotate and reuse detection is tested. Active Instagram tokens are stored only in encrypted credential rows using randomized AES-256-GCM envelopes; the key must be canonical Base64 encoding exactly 32 bytes. Sensitive production secrets must be supplied by runtime configuration.                  |
| A03 Injection                                  | API inputs are validated with Zod schemas; Prisma parameterization is used for ORM access; raw SQL usage is limited and parameterized through Prisma helpers.                                                                                                                                                                                                                                             |
| A04 Insecure Design                            | Milestone gates require tenant isolation, billing state enforcement, quota enforcement, provider live-readiness checks, and external-provider live mode flags before launch.                                                                                                                                                                                                                              |
| A05 Security Misconfiguration                  | Fastify registers Helmet; CORS is restricted to `WEB_BASE_URL`; staging/runtime secrets are documented; production observability is environment-gated.                                                                                                                                                                                                                                                    |
| A06 Vulnerable Components                      | `corepack pnpm security:audit` must pass at `moderate` or higher; current overrides pin patched `esbuild` and `postcss` versions.                                                                                                                                                                                                                                                                         |
| A07 Identification And Authentication Failures | Email/password login, email verification, Google login, JWT TTLs, refresh rotation, and TOTP MFA for sensitive roles are implemented and tested.                                                                                                                                                                                                                                                          |
| A08 Software And Data Integrity Failures       | GitHub Actions runs full verification; deploy workflow publishes immutable image tags; dependency overrides are explicit in workspace settings.                                                                                                                                                                                                                                                           |
| A09 Security Logging And Monitoring Failures   | Sensitive admin, billing, prompt, model, Instagram callback, and workspace actions write audit logs; Sentry hooks exist for web, API, worker, and AI services. Instagram OAuth route boundaries emit one terminal allowlisted event per failure and minimal lifecycle success events; raw errors, identities, callback data, credentials, provider bodies, Prisma metadata, SQL, and stacks are excluded. |
| A10 Server-Side Request Forgery                | Current external provider calls use constrained Meta endpoints or reviewed dependency base URLs; Instagram publish and analytics live modes remain behind explicit environment flags and readiness checks. The FastAPI service does not currently call OpenAI.                                                                                                                                            |

## Evidence To Save

For each release candidate, save:

- Commit SHA.
- `corepack pnpm security:audit` output.
- `corepack pnpm verify` output.
- `corepack pnpm build` output.
- Any dependency override changes.
- Any accepted residual risk and owner.

## Launch Notes

This internal audit does not replace a third-party penetration test if investors, enterprise customers, payment providers, or local compliance counsel require one. If a third-party audit is required, keep M6 acceptance open until its report is complete and all critical/high findings are resolved.

The 2026-08-03 production Instagram connection is narrow provider evidence, not a security sign-off for the full platform. Keep these current residual checks open:

- Verify the encryption-key contract without printing or copying the value; a variable can exist and still be invalid.
- Verify token refresh, deauthorization, data-deletion delivery, and disconnect across a real provider lifecycle.
- Do not deploy the FastAPI AI service as a publicly trusted internal dependency yet: `INTERNAL_SERVICE_TOKEN` is configured but not enforced, and API clients do not send it.
- Production verification-email delivery and the complete bearer-token browser lifecycle remain unproven even though their API foundations have automated coverage.
- Continue to treat publishing, analytics, payment, storage/CDN, and App Review as separate external security/acceptance gates.

See `project-status.md`, `staging-deploy.md`, and `../services/ai/README.md` for current scope and ownership.
