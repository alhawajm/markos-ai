#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check as prettierCheck, resolveConfig as resolvePrettierConfig } from "prettier";

const modes = new Set(["--check", "--list", "--write"]);
const mode = process.argv[2] ?? "--write";

if (!modes.has(mode)) {
  console.error("Usage: node scripts/prettier-changed.mjs [--write|--check|--list]");
  process.exit(2);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supportedExtensions = new Set([
  ".cjs",
  ".css",
  ".gql",
  ".graphql",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".less",
  ".mjs",
  ".scss",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);

const changedFiles = readGitPaths(["diff", "HEAD", "--name-only", "--diff-filter=ACMR", "-z", "--"]);
const addedFiles = new Set(readGitPaths(["diff", "HEAD", "--name-only", "--diff-filter=A", "-z", "--"]));
const untrackedFiles = readGitPaths(["ls-files", "--others", "--exclude-standard", "-z", "--"]);
const untrackedFileSet = new Set(untrackedFiles);
const candidates = [...new Set([...changedFiles, ...untrackedFiles])]
  .filter((path) => supportedExtensions.has(extname(path).toLowerCase()))
  .sort((left, right) => left.localeCompare(right));
const files = [];
const legacyFiles = [];

for (const path of candidates) {
  if (addedFiles.has(path) || untrackedFileSet.has(path) || (await wasFormattedAtHead(path))) {
    files.push(path);
  } else {
    legacyFiles.push(path);
  }
}

if (mode === "--list") {
  printFileGroup("Prettier will process", files);
  printFileGroup("Legacy files deferred to format:all", legacyFiles);
  process.exit(0);
}

if (legacyFiles.length > 0) {
  console.log(`Skipping ${legacyFiles.length} legacy files; use format:all only for a dedicated baseline.`);
}

if (files.length === 0) {
  console.log("No changed or untracked code files need Prettier.");
  process.exit(0);
}

const prettierCli = fileURLToPath(import.meta.resolve("prettier/bin/prettier.cjs"));
const result = spawnSync(process.execPath, [prettierCli, mode, "--ignore-unknown", ...files], {
  cwd: repositoryRoot,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function readGitPaths(arguments_) {
  const output = execFileSync("git", ["-c", "core.safecrlf=false", ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  return output.split("\0").filter(Boolean);
}

async function wasFormattedAtHead(path) {
  let source;

  try {
    source = execFileSync("git", ["show", `HEAD:${path}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status !== 0) {
      return false;
    }

    throw error;
  }

  const filepath = resolve(repositoryRoot, path);
  const configuration = (await resolvePrettierConfig(filepath)) ?? {};

  return prettierCheck(source, {
    ...configuration,
    filepath
  });
}

function printFileGroup(label, paths) {
  console.log(`${label} (${paths.length}):`);
  console.log(paths.length > 0 ? paths.join("\n") : "  none");
}
