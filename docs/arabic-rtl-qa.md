# Arabic and RTL QA

Status date: 2026-08-16.

This runbook defines the M6 Arabic/RTL source gate and manual visual pass for the current Sunlit web shell. It does not close visual QA merely because the automated source check passes.

## Automated Gate

Run:

```bash
corepack pnpm rtl:qa
```

The check verifies:

- Localized routes expose Arabic and English static params.
- The root route defaults to `/ar`.
- The localized layout sets `lang={locale}`.
- The localized layout sets `dir={directionForLocale(locale)}`.
- Arabic resolves to RTL and English resolves to LTR.
- The shell has Arabic and English language-switch links for the active section.
- Web and i18n source files do not contain common UTF-8 mojibake markers.

`corepack pnpm verify` also runs this QA check before the Turborepo typecheck, lint, and test gate.

## Manual Smoke Check

Before private beta, open:

- `/ar`
- `/en`
- `/ar/signup` and `/en/signup`
- `/ar/login` and `/en/login`
- `/ar/onboarding` and `/en/onboarding`
- `/ar/app` and `/en/app`
- `/ar/app/strategy` and `/en/app/strategy`
- `/ar/app/content-studio` and `/en/app/content-studio`
- `/ar/app/analytics` and `/en/app/analytics`
- `/ar/app/knowledge` and `/en/app/knowledge`
- `/ar/app/settings` and `/en/app/settings`

The current code also exposes routeable but non-primary-nav panels for `briefing`, `opportunities`, and `campaign-builder`; include them when they are in the tested release scope.

Confirm:

- Arabic pages read right-to-left.
- English pages read left-to-right.
- Sidebar navigation remains clickable in both locales.
- Language switching keeps the same active section.
- Arabic text is not mojibake.
- Buttons, tables, inputs, and cards do not overlap at desktop and mobile widths.
- Session, empty, loading, error, success, limit, and blocked states retain the correct direction and a usable next action.

## Current Caveat

The automated check is source-level. The legacy `/ar/content`, `/en/content`, `/ar/admin`, and `/en/admin` routes now redirect into Sunlit; they do not prove that the former content or admin screens still exist. In particular, `/admin` currently redirects to Settings rather than mounting the final admin console.

Visual screenshots are required before public launch for every in-scope Sunlit surface at desktop and mobile widths. When the full Vault editor/history, publishing queue/recovery, analytics suite, AI consultant, and admin console are restored, add their Arabic/English routes to this manual matrix.
