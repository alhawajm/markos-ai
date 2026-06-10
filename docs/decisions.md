# Decisions

## 2026-06-10: Canonical Documents

Use `MARKOS_BUILD_SPEC. 2.pdf` and `MARKOS_AGENTS. 2.0.pdf` as canonical over older PDFs and over older implementation-plan assumptions.

## 2026-06-10: Payments Precedence

The implementation plan references Stripe as primary, but the newer build spec supersedes it. Build Bahrain-first payment adapters for CrediMax and BENEFIT, with Stripe as international fallback.

## 2026-06-10: Model Names

Do not hardcode model names in code. Use environment variables and provider interfaces. The named models in source documents are planning examples, not code constants.

## 2026-06-10: Tailwind Major

Use Tailwind CSS 3.4.x for the initial Next.js 14 scaffold because the spec expects a conventional Tailwind config and token mapping. Revisit Tailwind 4 only if it removes friction without changing product behavior.

## 2026-06-10: Next Config Extension

Use `next.config.mjs` instead of the spec example `next.config.ts` because Next.js 14.2 rejects TypeScript config files in this environment.

## 2026-06-10: Brand Onboarding Writes Tone

The spec defines 7 onboarding modules but the Vault has 8 sections, including `TONE`. Treat the Brand module as the source for both `BRAND` and `TONE` when tone words or voice notes are supplied, so onboarding can complete the full Vault readiness score without adding an eighth wizard step.

## 2026-06-10: Public Media Registration Before Storage

Before building S3/CDN upload infrastructure, support workspace-scoped registration of external HTTPS media URLs and attach those media assets to content items. Publish readiness must verify attached media belongs to the same workspace and has an HTTPS public URL. Treat this as scaffolding for Instagram container readiness, not as final storage or publishing.
