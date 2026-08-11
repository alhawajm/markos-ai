# Formatting

MARKOS uses Prettier for JavaScript, TypeScript, JSON, CSS, YAML, and related code files. The repository policy is intentionally conservative while the existing formatting baseline is migrated:

- `pnpm format` formats new files and modified files whose committed version already matched the current Prettier policy.
- `pnpm format:check` checks that same safe set without changing files.
- `pnpm format:list` shows both the files that will be processed and legacy files that will be deferred.
- `pnpm format:all` and `pnpm format:all:check` operate on the whole repository. Use them only for a dedicated formatting-baseline change, not inside feature work.

The configured line width is 160 characters, trailing commas are omitted, and existing line endings are preserved. Generated output, dependency caches, environment files, lockfiles, PDFs, and Markdown records are excluded from routine Prettier runs.

This migration guard prevents an ordinary feature branch from rewriting unrelated legacy files. A future baseline change can run `pnpm format:all` in its own reviewable pull request, after which those files will automatically join the routine enforced set.
