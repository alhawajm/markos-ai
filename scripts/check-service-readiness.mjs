// A read-only, zero-generation probe suitable for CI or an uptime monitor.
const api = new URL(process.env.MARKOS_API_URL ?? "https://api-production-dbba.up.railway.app");
if (api.username || api.password || !["http:", "https:"].includes(api.protocol)) throw new Error("Use an HTTP API origin without credentials");
try {
  const response = await fetch(new URL("/v1/ready", api), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const envelope = await response.json();
  const data = envelope.data;
  if (!data || !["ok", "degraded"].includes(data.status)) throw new Error("Readiness response is unavailable");
  console.log(
    JSON.stringify(
      {
        status: data.status,
        checkedAt: data.timestamp,
        dependencies: Object.fromEntries(
          Object.entries(data.dependencies).map(([name, value]) => [name, { status: value.status, durationMs: value.durationMs }])
        )
      },
      null,
      2
    )
  );
  if (!response.ok || data.status !== "ok") process.exitCode = 1;
} catch {
  console.error("MARKOS readiness probe failed. Check the API deployment and private dependencies.");
  process.exitCode = 1;
}
