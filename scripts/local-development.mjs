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
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
  OPENSEARCH_URL: "http://localhost:9200",
  REDIS_URL: "redis://localhost:6379",
  WEB_BASE_URL: "http://localhost:3000"
};

const OFFLINE_ENV = {
  AI_IMAGE_PROVIDER: "disabled",
  AI_TEXT_PROVIDER: "local",
  AI_VIDEO_PROVIDER: "disabled",
  OPENAI_API_KEY: "",
  OPENAI_STORE_RESPONSES: "false",
  SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_TELEMETRY_DISABLED: "1",
  TURBO_TELEMETRY_DISABLED: "1"
};
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

export function createLocalEnvironment({ rootEnv = {}, parentEnv = process.env } = {}) {
  const overrides = Object.fromEntries(
    Object.keys(LOCAL_DEFAULTS)
      .filter((key) => parentEnv[key] !== undefined)
      .map((key) => [key, parentEnv[key]])
  );
  return { ...parentEnv, ...LOCAL_DEFAULTS, ...rootEnv, ...overrides, ...OFFLINE_ENV };
}

export function validateLocalConfiguration({ aiEnv = {}, rootEnv = {} }) {
  const errors = [];
  const root = { ...LOCAL_DEFAULTS, ...rootEnv };

  const databaseUrl = validateLoopbackUrl(errors, "DATABASE_URL", root.DATABASE_URL, new Set(["postgresql:", "postgres:"]));
  if (databaseUrl !== undefined && databaseUrl.pathname !== "/markos") {
    errors.push("DATABASE_URL must use the persistent local markos database for browser development.");
  }

  validateLoopbackUrl(errors, "REDIS_URL", root.REDIS_URL, new Set(["redis:", "rediss:"]));
  validateLoopbackUrl(errors, "OPENSEARCH_URL", root.OPENSEARCH_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "AI_BASE_URL", root.AI_BASE_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "API_BASE_URL", root.API_BASE_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "NEXT_PUBLIC_API_BASE_URL", root.NEXT_PUBLIC_API_BASE_URL, new Set(["http:", "https:"]));
  validateLoopbackUrl(errors, "WEB_BASE_URL", root.WEB_BASE_URL, new Set(["http:", "https:"]));

  if (root.EMAIL_PROVIDER !== "local") {
    errors.push("EMAIL_PROVIDER must remain local for offline development.");
  }
  if (root.MEDIA_STORAGE_DRIVER !== "local") {
    errors.push("MEDIA_STORAGE_DRIVER must remain local for offline development.");
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

  return {
    errors,
    summary: {
      database: databaseUrl?.pathname.slice(1) ?? "invalid",
      email: root.EMAIL_PROVIDER,
      imageProvider: "disabled",
      videoProvider: "disabled",
      textProvider: "local"
    }
  };
}

export function inspectLocalConfiguration() {
  const environment = createLocalEnvironment({ rootEnv: readOptionalEnv(repositoryEnvPath) });
  return {
    ...validateLocalConfiguration({
      aiEnv: readOptionalEnv(aiEnvPath),
      rootEnv: environment
    }),
    environment
  };
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
  console.log("  Offline development");
  console.log(`  Text provider: ${summary.textProvider}`);
  console.log(`  Image provider: ${summary.imageProvider}`);
  console.log(`  Video provider: ${summary.videoProvider}`);
  console.log(`  Database: localhost/${summary.database}`);
  console.log(`  Email provider: ${summary.email}`);
  console.log("  Hosted environments: not used");
  if (checkOnly) console.log("  Result: ready");
}

function startDevelopment(environment) {
  const child = spawn(process.execPath, [turboCliPath, "dev"], {
    cwd: repositoryRoot,
    env: environment,
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
  if (process.argv.slice(2).some((argument) => argument !== "--check")) {
    console.error("Usage: corepack pnpm dev OR corepack pnpm local:check");
    process.exitCode = 1;
    return;
  }
  const checkOnly = process.argv.includes("--check");
  const { errors, summary, environment } = inspectLocalConfiguration();

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

  startDevelopment(environment);
}

const entryPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (entryPath === import.meta.url) {
  main().catch((error) => {
    console.error(`MARKOS local development preflight failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
