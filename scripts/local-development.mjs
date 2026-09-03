import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const repositoryEnvPath = resolve(repositoryRoot, ".env");
const aiEnvPath = resolve(repositoryRoot, "services", "ai", ".env");
const turboCliPath = resolve(repositoryRoot, "node_modules", "turbo", "bin", "turbo");

const LOCAL_DEFAULTS = {
  AI_BASE_URL: "http://localhost:8000",
  API_BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://markos:markos@localhost:5432/markos",
  EMAIL_PROVIDER: "local",
  INSTAGRAM_ANALYTICS_SYNC_MODE: "dry_run",
  INSTAGRAM_PUBLISH_MODE: "dry_run",
  MEDIA_STORAGE_DRIVER: "local",
  OPENSEARCH_URL: "http://localhost:9200",
  REDIS_URL: "redis://localhost:6379",
  WEB_BASE_URL: "http://localhost:3000"
};

const ALLOWED_MODES = new Set(["safe", "live-ai"]);
const APPLICATION_PORTS = [
  { name: "web", port: 3000 },
  { name: "API", port: 4000 },
  { name: "AI", port: 8000 }
];
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function parseDotEnv(source) {
  const values = {};

  for (const rawLine of source.split(/\r?\n/u)) {
    let line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (match === null) continue;

    const [, key, rawValue = ""] = match;
    let value = rawValue.trim();
    const quote = value[0];

    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, "").trimEnd();
    }

    values[key] = value;
  }

  return values;
}

function readOptionalEnv(path) {
  if (!existsSync(path)) return {};
  return parseDotEnv(readFileSync(path, "utf8"));
}

function isPlaceholder(value) {
  if (value === undefined || value.trim() === "") return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "change-me" || normalized === "replace-me" || normalized.startsWith("<");
}

function validateLoopbackUrl(errors, name, value, protocols) {
  try {
    const parsed = new URL(value);
    if (!protocols.has(parsed.protocol)) {
      errors.push(`${name} must use ${[...protocols].join(" or ")} for local development.`);
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      errors.push(`${name} must point to this PC, not a hosted service.`);
    }
    return parsed;
  } catch {
    errors.push(`${name} is not a valid local URL.`);
    return undefined;
  }
}

export function validateLocalConfiguration({ aiEnv = {}, mode, rootEnv = {} }) {
  const errors = [];
  const root = { ...LOCAL_DEFAULTS, ...rootEnv };

  if (!ALLOWED_MODES.has(mode)) {
    errors.push(`Unknown local mode: ${mode}.`);
  }

  const databaseUrl = validateLoopbackUrl(errors, "DATABASE_URL", root.DATABASE_URL, new Set(["postgresql:", "postgres:"]));
  if (databaseUrl !== undefined && databaseUrl.pathname !== "/markos") {
    errors.push("DATABASE_URL must use the persistent local markos database for browser development.");
  }

  validateLoopbackUrl(errors, "REDIS_URL", root.REDIS_URL, new Set(["redis:", "rediss:"]));
  validateLoopbackUrl(errors, "OPENSEARCH_URL", root.OPENSEARCH_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "AI_BASE_URL", root.AI_BASE_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "API_BASE_URL", root.API_BASE_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "WEB_BASE_URL", root.WEB_BASE_URL, new Set(["http:", "https:"]));

  if (root.EMAIL_PROVIDER !== "local") {
    errors.push("EMAIL_PROVIDER must remain local in the two standard development modes.");
  }
  if (root.MEDIA_STORAGE_DRIVER !== "local") {
    errors.push("MEDIA_STORAGE_DRIVER must remain local in the two standard development modes.");
  }
  if (root.INSTAGRAM_PUBLISH_MODE !== "dry_run" || root.INSTAGRAM_ANALYTICS_SYNC_MODE !== "dry_run") {
    errors.push("Instagram publishing and analytics must remain in dry-run mode locally.");
  }

  const rootToken = rootEnv.INTERNAL_SERVICE_TOKEN;
  const aiToken = aiEnv.INTERNAL_SERVICE_TOKEN;
  if (rootToken !== undefined || aiToken !== undefined) {
    if (isPlaceholder(rootToken) || isPlaceholder(aiToken) || rootToken !== aiToken) {
      errors.push("INTERNAL_SERVICE_TOKEN must be non-placeholder and identical in .env and services/ai/.env.");
    }
  }

  if (mode === "live-ai") {
    if (isPlaceholder(aiEnv.OPENAI_API_KEY)) {
      errors.push("OPENAI_API_KEY is missing from services/ai/.env.");
    }

    for (const key of ["LLM_PRIMARY_MODEL", "LLM_LONGFORM_MODEL"]) {
      if (isPlaceholder(rootEnv[key]) || isPlaceholder(aiEnv[key])) {
        errors.push(`${key} must be configured in both .env files for live AI.`);
      } else if (rootEnv[key] !== aiEnv[key]) {
        errors.push(`${key} must match between .env and services/ai/.env.`);
      } else if (rootEnv[key].startsWith("local-")) {
        errors.push(`${key} cannot use a deterministic local model name in live-AI mode.`);
      }
    }
  }

  return {
    errors,
    summary: {
      database: databaseUrl?.pathname.slice(1) ?? "invalid",
      email: root.EMAIL_PROVIDER,
      imageProvider: "disabled",
      mode,
      responseStorage: aiEnv.OPENAI_STORE_RESPONSES === "true" ? "enabled" : "disabled",
      textProvider: mode === "live-ai" ? "openai" : "local"
    }
  };
}

export function inspectLocalConfiguration(mode) {
  return validateLocalConfiguration({
    aiEnv: readOptionalEnv(aiEnvPath),
    mode,
    rootEnv: readOptionalEnv(repositoryEnvPath)
  });
}

function isPortInUse(port) {
  return new Promise((resolveUsage) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (inUse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveUsage(inUse);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

export async function findBusyApplicationPorts(ports = APPLICATION_PORTS) {
  const usage = await Promise.all(ports.map(async ({ name, port }) => ({ inUse: await isPortInUse(port), name, port })));
  return usage.filter(({ inUse }) => inUse).map(({ name, port }) => ({ name, port }));
}

function printSummary(summary, checkOnly) {
  console.log("MARKOS local development preflight");
  console.log(`  Mode: ${summary.mode}`);
  console.log(`  Text provider: ${summary.textProvider}`);
  console.log(`  Image provider: ${summary.imageProvider}`);
  console.log(`  OpenAI response storage: ${summary.responseStorage}`);
  console.log(`  Database: localhost/${summary.database}`);
  console.log(`  Email provider: ${summary.email}`);
  console.log("  Hosted environments: not used");
  if (checkOnly) console.log("  Result: ready");
}

function startDevelopment(mode) {
  const child = spawn(process.execPath, [turboCliPath, "dev"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      AI_IMAGE_PROVIDER: "disabled",
      AI_TEXT_PROVIDER: mode === "live-ai" ? "openai" : "local"
    },
    shell: false,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error(`Unable to start MARKOS development services: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

async function main() {
  const mode = process.argv[2] ?? "safe";
  const checkOnly = process.argv.includes("--check");
  const { errors, summary } = inspectLocalConfiguration(mode);

  if (errors.length > 0) {
    console.error("MARKOS local development preflight failed:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  printSummary(summary, checkOnly);
  if (checkOnly) return;

  const busyPorts = await findBusyApplicationPorts();
  if (busyPorts.length > 0) {
    console.error("MARKOS application ports are already in use:");
    for (const { name, port } of busyPorts) console.error(`  - ${name}: ${port}`);
    console.error("Stop the existing MARKOS application session before starting another one. Docker may remain running.");
    process.exitCode = 1;
    return;
  }

  startDevelopment(mode);
}

const entryPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (entryPath === import.meta.url) {
  main().catch((error) => {
    console.error(`MARKOS local development preflight failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
