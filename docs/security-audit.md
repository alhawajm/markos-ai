# OWASP Security Audit

Status date: 2026-08-16.

This runbook defines the M6 internal OWASP security audit gate. It records the controls, commands, evidence, and residual launch checks that must stay visible; a prior result does not close the gate for a new release candidate.

## Audit Command

Run:

```bash
corepack pnpm security:audit
```

This runs `pnpm audit --audit-level moderate` across the workspace. The audit must return `No known vulnerabilities found`.

## Latest Result

Last recorded repository result (rerun for every release candidate):

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
| A07 Identification And Authentication Failures | Email/password login, email verification, the backend Google ID-token exchange, JWT TTLs, refresh rotation, and TOTP MFA for sensitive roles are implemented and tested. The current Sunlit Google button remains unavailable, so backend coverage is not browser or provider proof.                                                                                                               |
| A08 Software And Data Integrity Failures       | GitHub Actions runs full verification; deploy workflow publishes immutable image tags; dependency overrides are explicit in workspace settings.                                                                                                                                                                                                                                                           |
| A09 Security Logging And Monitoring Failures   | Sensitive admin, billing, prompt, model, Instagram callback, and workspace actions write audit logs; Sentry hooks exist for web, API, worker, and AI services. Instagram OAuth route boundaries emit one terminal allowlisted event per failure and minimal lifecycle success events; raw errors, identities, callback data, credentials, provider bodies, Prisma metadata, SQL, and stacks are excluded. |
| A10 Server-Side Request Forgery                | Instagram Login hosts are constrained in the active client; publishing/analytics live modes remain behind explicit flags and readiness checks. The AI service calls OpenAI only through the explicit provider adapter when `AI_TEXT_PROVIDER=openai`; other dependency URLs come from server-side configuration and must be reviewed before deployment. |

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
- Keep the FastAPI service behind the intended backend boundary. Current source enforces `INTERNAL_SERVICE_TOKEN` on non-health routes and the API sends it, but deployment configuration, network exposure, and unauthorized-request rejection still require current environment evidence.
- Production verification-email delivery and the deployed bearer-token/browser-session journey remain unproven even though their current `main` implementation has focused automated coverage.
- Treat the direct 2026-08-06 provider request as narrow connectivity evidence; the current Strategy/profile application path still needs a deployed security and data-handling review.
- Continue to treat publishing, analytics, payment, storage/CDN, and App Review as separate external security/acceptance gates.

See `project-status.md`, `staging-deploy.md`, and `../services/ai/README.md` for current scope and ownership.
