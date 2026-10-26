import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(import.meta.url);
const store = resolve(root, "node_modules/.pnpm");
const yamlPackage = fs
  .readdirSync(store)
  .filter((name) => name.startsWith("yaml@2."))
  .at(-1);
if (!yamlPackage) throw new Error("Install repository dependencies first");
const yaml = require(resolve(store, yamlPackage, "node_modules/yaml"));
const semver = require(resolve(root, "apps/web/node_modules/next/dist/compiled/semver"));
const lock = yaml.parse(fs.readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8"));
const workspace = yaml.parse(fs.readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"));
const versions = new Map(),
  paths = new Map(),
  visited = new Set();
function visit(name, version, path) {
  if (typeof version !== "string" || /^(link|file|workspace):/.test(version)) return;
  const id = `${name}@${version}`,
    plain = version.split("(")[0];
  if (!/^\d+\.\d+\.\d+/.test(plain)) return;
  const key = `${name}@${plain}`;
  if (!paths.has(key)) paths.set(key, new Set());
  paths.get(key).add(path);
  if (visited.has(id)) return;
  visited.add(id);
  if (!versions.has(name)) versions.set(name, new Set());
  versions.get(name).add(plain);
  const snapshot = lock.snapshots?.[id];
  for (const [dependency, value] of Object.entries({ ...snapshot?.dependencies, ...snapshot?.optionalDependencies }))
    visit(dependency, value, `${path}>${dependency}`);
}
for (const [workspace, importer] of Object.entries(lock.importers))
  for (const [name, value] of Object.entries({ ...importer.dependencies, ...importer.optionalDependencies }))
    visit(name, value.version, `${workspace}>${name}`);
try {
  const response = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries([...versions].map(([name, values]) => [name, [...values]]))),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error("Audit registry unavailable");
  const data = await response.json(),
    advisories = [];
  for (const [name, values] of Object.entries(data))
    for (const advisory of values) {
      const affected = [...(versions.get(name) ?? [])].filter((version) => semver.satisfies(version, advisory.vulnerable_versions));
      if (affected.length)
        advisories.push({
          package: name,
          title: advisory.title,
          severity: advisory.severity,
          affectedVersions: affected,
          vulnerableVersions: advisory.vulnerable_versions,
          advisory: advisory.url,
          dependencyPaths: affected.flatMap((version) => [...(paths.get(`${name}@${version}`) ?? [])])
        });
    }
  const backports = JSON.parse(fs.readFileSync(resolve(root, "docs/security/backports.json"), "utf8"));
  for (const advisory of advisories) {
    const backport = backports.find(
      (b) => b.package === advisory.package && b.advisory === advisory.advisory && advisory.affectedVersions.every((v) => v === b.version)
    );
    if (!backport || !/^patches\/[A-Za-z0-9@._-]+\.patch$/.test(backport.patch) || new Date(backport.reviewBy + "T23:59:59Z") < new Date()) continue;
    const applied = lock.patchedDependencies?.[`${backport.package}@${backport.version}`];
    const appliedHash = typeof applied === "string" ? applied : applied?.hash;
    if (
      workspace.patchedDependencies?.[`${backport.package}@${backport.version}`] === backport.patch &&
      appliedHash === backport.lockHash &&
      createHash("sha256")
        .update(fs.readFileSync(resolve(root, backport.patch)))
        .digest("hex") === backport.sha256
    )
      advisory.remediation = {
        status: "APPLIED_BACKPORT",
        mitigation: backport.mitigation,
        test: backport.test,
        reviewBy: backport.reviewBy,
        patch: backport.patch
      };
  }
  const counts = Object.fromEntries(["critical", "high", "moderate", "low"].map((level) => [level, advisories.filter((a) => a.severity === level).length]));
  const unmitigated = advisories.filter((a) => !a.remediation);
  const summary = {
    checkedAt: new Date().toISOString(),
    registry: "npm bulk advisory API",
    scope: "production and optional dependency graph from lockfile",
    packages: versions.size,
    counts,
    unmitigated: unmitigated.length,
    advisories
  };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, advisories: advisories.map(({ dependencyPaths: _paths, ...a }) => a) }, null, 2));
  if (unmitigated.some((a) => ["critical", "high", "moderate"].includes(a.severity))) process.exitCode = 1;
} catch {
  console.error("Bulk security audit did not complete; no clean result is claimed.");
  process.exitCode = 2;
}
