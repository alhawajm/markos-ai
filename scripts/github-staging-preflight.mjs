#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const strict = process.argv.includes("--strict");
const create = process.argv.includes("--create");
const evidenceDate =
  process.env.M6_EVIDENCE_DATE ?? new Date().toISOString().slice(0, 10);
const outputDir = join(
  process.cwd(),
  "evidence",
  "m6",
  evidenceDate,
  "staging",
);
const outputPath = join(outputDir, "github-staging-preflight.json");

const smokeVariables = ["STAGING_API_BASE_URL", "STAGING_WEB_BASE_URL"];
const ecsCoreVariables = [
  "STAGING_AWS_ROLE_ARN",
  "STAGING_AWS_REGION",
  "STAGING_ECS_CLUSTER",
];
const ecsServiceVariables = [
  "STAGING_WEB_SERVICE",
  "STAGING_API_SERVICE",
  "STAGING_WORKER_SERVICE",
  "STAGING_AI_SERVICE",
];

if (process.argv.includes("--help")) {
  printHelp();
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY ?? readRepositoryFromGit();
const startedAt = new Date().toISOString();
const report = buildReport(repo);

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`Saved GitHub staging preflight evidence to ${outputPath}`);

if (strict && report.status !== "ready") {
  console.error(
    `GitHub staging preflight failed: ${report.blockers.join("; ")}`,
  );
  process.exit(1);
}

function buildReport(repository) {
  let environment = readEnvironment(repository);

  if (!environment.exists && create) {
    createEnvironment(repository);
    environment = readEnvironment(repository);
  }

  const variables = environment.exists
    ? readEnvironmentVariables(repository)
    : [];
  const variableNames = new Set(variables.map((variable) => variable.name));
  const smoke = summarizeVariableGroup(smokeVariables, variableNames);
  const ecsCore = summarizeVariableGroup(ecsCoreVariables, variableNames);
  const ecsServices = summarizeVariableGroup(
    ecsServiceVariables,
    variableNames,
  );
  const ecsConfigured = ecsCore.ready && ecsServices.present.length > 0;
  const blockers = [];

  if (!environment.exists) {
    blockers.push("GitHub staging environment is missing");
  }

  if (!smoke.ready) {
    blockers.push(`Missing smoke variables: ${smoke.missing.join(", ")}`);
  }

  if (!ecsConfigured) {
    blockers.push(
      ecsCore.ready
        ? "No ECS service variables configured"
        : `Missing ECS core variables: ${ecsCore.missing.join(", ")}`,
    );
  }

  return {
    gate: "staging",
    event: "github-staging-preflight",
    status:
      environment.exists && smoke.ready && ecsConfigured ? "ready" : "blocked",
    repository,
    environment: "staging",
    startedAt,
    finishedAt: new Date().toISOString(),
    checks: {
      environment,
      smokeVariables: smoke,
      ecsCoreVariables: ecsCore,
      ecsServiceVariables: ecsServices,
    },
    blockers,
  };
}

function readEnvironment(repository) {
  try {
    const environment = ghJson([
      "api",
      `/repos/${repository}/environments/staging`,
    ]);
    return {
      exists: true,
      name: environment.name,
      protectedBranches: Boolean(
        environment.deployment_branch_policy?.protected_branches,
      ),
      customBranchPolicies: Boolean(
        environment.deployment_branch_policy?.custom_branch_policies,
      ),
    };
  } catch (error) {
    return {
      exists: false,
      error: errorToMessage(error),
    };
  }
}

function createEnvironment(repository) {
  execFileSync(
    "gh",
    ["api", "--method", "PUT", `/repos/${repository}/environments/staging`],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function readEnvironmentVariables(repository) {
  try {
    const response = ghJson([
      "api",
      `/repos/${repository}/environments/staging/variables`,
      "--paginate",
    ]);
    return Array.isArray(response.variables)
      ? response.variables.map((variable) => ({ name: variable.name }))
      : [];
  } catch {
    return [];
  }
}

function summarizeVariableGroup(requiredNames, variableNames) {
  const present = requiredNames.filter((name) => variableNames.has(name));
  const missing = requiredNames.filter((name) => !variableNames.has(name));

  return {
    ready: missing.length === 0,
    present,
    missing,
  };
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

function errorToMessage(error) {
  if (
    error instanceof Error &&
    "stderr" in error &&
    Buffer.isBuffer(error.stderr)
  ) {
    return error.stderr.toString("utf8").trim();
  }

  return error instanceof Error ? error.message : "Unknown GitHub CLI failure";
}

function printHelp() {
  console.log(`MARKOS GitHub staging preflight

Checks the GitHub staging environment without printing variable values.

Usage:
  corepack pnpm staging:github-preflight
  corepack pnpm staging:github-preflight -- --create
  corepack pnpm staging:github-preflight -- --strict

Environment:
  GITHUB_REPOSITORY=owner/repo  Optional; defaults to git origin.
  M6_EVIDENCE_DATE=yyyy-mm-dd  Optional evidence folder date.

Output:
  evidence/m6/<date>/staging/github-staging-preflight.json
`);
}
