# Formatting

MARKOS uses Prettier for JavaScript, TypeScript, JSON, CSS, YAML, and related code files.

- `pnpm format` formats the repository.
- `pnpm format:check` checks the repository without changing files.
- `pnpm verify` runs the formatting check before the remaining validation tasks.

The configured line width is 160 characters, trailing commas are omitted, and text files use LF line endings except for Windows batch scripts. Generated output, dependency caches, local editor settings, environment files, lockfiles, PDFs, and Markdown records are excluded from Prettier.

Run the repository scripts instead of invoking Prettier directly so local and CI validation use the same command.
