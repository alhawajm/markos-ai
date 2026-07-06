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

| OWASP area | MARKOS control |
| --- | --- |
| A01 Broken Access Control | Workspace middleware resolves active workspace and user roles; route configs require named permissions; workspace isolation tests cover every Prisma model with `workspaceId`; RLS policies fail closed without `app.current_workspace`. |
| A02 Cryptographic Failures | Passwords use Argon2id; JWT access and refresh secrets are environment-controlled; refresh tokens rotate and reuse detection is tested; sensitive production secrets must be supplied by runtime configuration. |
| A03 Injection | API inputs are validated with Zod schemas; Prisma parameterization is used for ORM access; raw SQL usage is limited and parameterized through Prisma helpers. |
| A04 Insecure Design | Milestone gates require tenant isolation, billing state enforcement, quota enforcement, provider live-readiness checks, and external-provider live mode flags before launch. |
| A05 Security Misconfiguration | Fastify registers Helmet; CORS is restricted to `WEB_BASE_URL`; staging/runtime secrets are documented; production observability is environment-gated. |
| A06 Vulnerable Components | `corepack pnpm security:audit` must pass at `moderate` or higher; current overrides pin patched `esbuild` and `postcss` versions. |
| A07 Identification And Authentication Failures | Email/password login, email verification, Google login, JWT TTLs, refresh rotation, and TOTP MFA for sensitive roles are implemented and tested. |
| A08 Software And Data Integrity Failures | GitHub Actions runs full verification; deploy workflow publishes immutable image tags; dependency overrides are explicit in workspace settings. |
| A09 Security Logging And Monitoring Failures | Sensitive admin, billing, prompt, model, Instagram callback, and workspace actions write audit logs; Sentry hooks exist for web, API, worker, and AI services. |
| A10 Server-Side Request Forgery | External provider calls are limited to configured Meta/OpenAI-style adapter URLs; Instagram publish and analytics live modes remain behind explicit environment flags and readiness checks. |

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
