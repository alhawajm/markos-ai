#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";

const strict = process.argv.includes("--strict");
const runId = readArg("--run-id");
const requestedSha = readArg("--sha") ?? process.env.RELEASE_SHA;
const evidenceDate =
  process.env.M6_EVIDENCE_DATE ?? new Date().toISOString().slice(0, 10);
const repository = process.env.GITHUB_REPOSITORY ?? readRepositoryFromGit();
const outputDir = join(
  process.cwd(),
  "evidence",
  "m6",
  evidenceDate,
  "staging",
);
const tempDir = join(process.cwd(), ".tmp", "staging-evidence-artifacts");
const outputPath = join(outputDir, "github-staging-artifact-download.json");
const requiredArtifactPrefixes = [
  "m6-staging-image-evidence-",
  "m6-staging-smoke-evidence-",
];
const optionalArtifactPrefixes = ["m6-staging-ecs-rollout-evidence-"];

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

const report = buildAndDownloadReport();
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`Saved GitHub staging artifact report to ${outputPath}`);

if (strict && report.status !== "ready") {
  console.error(
    `GitHub staging evidence download failed: ${report.blockers.join("; ")}`,
  );
  process.exit(1);
}

function buildAndDownloadReport() {
  const startedAt = new Date().toISOString();
  const run = runId ? readRun(runId) : findLatestSuccessfulRun();
  const blockers = [];

  if (!run) {
    blockers.push(
      requestedSha
        ? `No successful Deploy Staging run found for ${requestedSha}`
        : "No successful Deploy Staging run found",
    );

    return baseReport(startedAt, undefined, [], [], blockers);
  }

  const artifacts = readRunArtifacts(run.databaseId);
  const downloads = downloadArtifacts(run.databaseId, artifacts);
  const required = summarizeArtifacts(requiredArtifactPrefixes, artifacts);
  const optional = summarizeArtifacts(optionalArtifactPrefixes, artifacts);

  if (!required.ready) {
    blockers.push(`Missing required artifacts: ${required.missing.join(", ")}`);
  }

  return {
    ...baseReport(startedAt, run, artifacts, downloads, blockers),
    checks: {
      requiredArtifacts: required,
      optionalArtifacts: optional,
    },
  };
}

function baseReport(startedAt, run, artifacts, downloads, blockers) {
  return {
    gate: "staging",
    event: "github-staging-artifact-download",
    status: blockers.length === 0 ? "ready" : "blocked",
    repository,
    workflow: "deploy-staging.yml",
    run: run
      ? {
          databaseId: run.databaseId,
          headSha: run.headSha,
          headBranch: run.headBranch,
          status: run.status,
          conclusion: run.conclusion,
          url: run.url,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        }
      : undefined,
    startedAt,
    finishedAt: new Date().toISOString(),
    artifacts: artifacts.map((artifact) => ({
      name: artifact.name,
      expired: artifact.expired,
      sizeInBytes: artifact.size_in_bytes,
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
    })),
    downloads,
    blockers,
  };
}

function findLatestSuccessfulRun() {
  const runs = ghJson([
    "run",
    "list",
    "--repo",
    repository,
    "--workflow",
    "deploy-staging.yml",
    "--branch",
    "main",
    "--limit",
    "30",
    "--json",
    "databaseId,headSha,headBranch,status,conclusion,createdAt,updatedAt,url",
  ]);

  return runs.find(
    (run) =>
      run.status === "completed" &&
      run.conclusion === "success" &&
      (!requestedSha || run.headSha === requestedSha),
  );
}

function readRun(id) {
  const run = ghJson([
    "run",
    "view",
    id,
    "--repo",
    repository,
    "--json",
    "databaseId,headSha,headBranch,status,conclusion,createdAt,updatedAt,url",
  ]);

  if (requestedSha && run.headSha !== requestedSha) {
    return undefined;
  }

  return run;
}

function readRunArtifacts(id) {
  const response = ghJson([
    "api",
    `/repos/${repository}/actions/runs/${id}/artifacts`,
    "--paginate",
  ]);

  return Array.isArray(response.artifacts) ? response.artifacts : [];
}

function downloadArtifacts(id, artifacts) {
  rmSync(tempDir, { force: true, recursive: true });
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const selectedArtifacts = artifacts.filter((artifact) =>
    [...requiredArtifactPrefixes, ...optionalArtifactPrefixes].some((prefix) =>
      artifact.name.startsWith(prefix),
    ),
  );

  const downloads = [];

  for (const artifact of selectedArtifacts) {
    const artifactDir = join(tempDir, artifact.name);
    mkdirSync(artifactDir, { recursive: true });

    execFileSync(
      "gh",
      [
        "run",
        "download",
        String(id),
        "--repo",
        repository,
        "--name",
        artifact.name,
        "--dir",
        artifactDir,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const files = listFiles(artifactDir);
    for (const file of files) {
      const target = join(outputDir, basename(file));
      copyFileSync(file, target);
      downloads.push({
        artifact: artifact.name,
        source: relative(process.cwd(), file),
        target: relative(process.cwd(), target),
      });
    }
  }

  return downloads;
}

function summarizeArtifacts(prefixes, artifacts) {
  const present = prefixes.filter((prefix) =>
    artifacts.some((artifact) => artifact.name.startsWith(prefix)),
  );
  const missing = prefixes.filter((prefix) => !present.includes(prefix));

  return {
    ready: missing.length === 0,
    present,
    missing,
  };
}

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listFiles(path));
      continue;
    }

    files.push(path);
  }

  return files.sort();
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readRepositoryFromGit() {
  const remote = execFileSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  }).trim();
  const match = remote.match(
    /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/i,
  );

  if (!match?.groups) {
    console.error(
      "Could not determine GitHub repository. Set GITHUB_REPOSITORY=owner/repo.",
    );
    process.exit(1);
  }

  return `${match.groups.owner}/${match.groups.repo}`;
}

function ghJson(args) {
  const output = execFileSync("gh", [...args, "--jq", "."], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
}

function printHelp() {
  console.log(`MARKOS GitHub staging evidence download

Downloads staging evidence artifacts from a successful Deploy Staging workflow run.

Usage:
  corepack pnpm staging:evidence-download
  corepack pnpm staging:evidence-download -- --sha <release-sha>
  corepack pnpm staging:evidence-download -- --run-id <github-run-id>
  corepack pnpm staging:evidence-download -- --strict

Environment:
  GITHUB_REPOSITORY=owner/repo  Optional; defaults to git origin.
  RELEASE_SHA=<commit-sha>      Optional release SHA filter.
  M6_EVIDENCE_DATE=yyyy-mm-dd   Optional evidence folder date.

Output:
  evidence/m6/<date>/staging/github-staging-artifact-download.json
  evidence/m6/<date>/staging/<downloaded-artifacts>
`);
}
