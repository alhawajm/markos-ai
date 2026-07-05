# Arabic and RTL QA

This runbook closes the M6 Arabic/RTL QA pass for the current web shell.

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
- `/ar/content`
- `/en/content`
- `/ar/admin`
- `/en/admin`

Confirm:

- Arabic pages read right-to-left.
- English pages read left-to-right.
- Sidebar navigation remains clickable in both locales.
- Language switching keeps the same active section.
- Arabic text is not mojibake.
- Buttons, tables, inputs, and cards do not overlap at desktop and mobile widths.

## Current Caveat

The automated check is source-level. Visual regression screenshots are still recommended before public launch, especially for dense admin, analytics, content, and onboarding screens.
