import type { DependencyHealth } from "./deep-health";

export function backupFreshness(value: string | null, maxAgeHours: number, now = Date.now()): DependencyHealth {
  try {
    const parsed = JSON.parse(value ?? "null") as { completedAt?: unknown } | null;
    const stamp = typeof parsed?.completedAt === "string" ? Date.parse(parsed.completedAt) : NaN;
    if (!Number.isFinite(stamp) || stamp > now + 300000 || now - stamp > maxAgeHours * 3600000)
      return { status: "down", durationMs: 0, detail: "No recent verified snapshot" };
    return { status: "ok", durationMs: 0 };
  } catch {
    return { status: "down", durationMs: 0, detail: "No recent verified snapshot" };
  }
}
