// A read-only, zero-generation probe suitable for CI or an uptime monitor.
const api = new URL(process.env.MARKOS_API_URL ?? "https://api-production-dbba.up.railway.app");
if (api.username || api.password || !["http:", "https:"].includes(api.protocol)) throw new Error("Use an HTTP API origin without credentials");
try {
  const [response, backupResponse] = await Promise.all(
    ["/v1/ready", "/v1/health/backups"].map((path) => fetch(new URL(path, api), { signal: AbortSignal.timeout(15_000), cache: "no-store" }))
  );
  const envelope = await response.json();
  const data = envelope.data;
  const backup = (await backupResponse.json()).data;
  if (!data || !["ok", "degraded"].includes(data.status)) throw new Error("Readiness response is unavailable");
  if (!backup || !["ok", "degraded"].includes(backup.status)) throw new Error("Backup status is unavailable");
  console.log(
    JSON.stringify(
      {
        status: data.status,
        backupStatus: backup.backup.status,
        checkedAt: data.timestamp,
        dependencies: Object.fromEntries(
          Object.entries(data.dependencies).map(([name, value]) => [name, { status: value.status, durationMs: value.durationMs }])
        )
      },
      null,
      2
    )
  );
  if (!response.ok || data.status !== "ok" || !backupResponse.ok || backup.status !== "ok") process.exitCode = 1;
} catch {
  console.error("MARKOS readiness probe failed. Check the API deployment and private dependencies.");
  process.exitCode = 1;
}
