import type { ContentAuthoringOperation, ContentRecord } from "@markos/shared-types";

const fields = ["caption", "brief", "contentPillar", "campaignGoal", "tone"] as const;
const mediaFields = ["title", "body", "visualDirection", "aspectRatio", "generationDurationSeconds"] as const;
export function draftOperations(base: ContentRecord, draft: ContentRecord): ContentAuthoringOperation[] {
  const operations: ContentAuthoringOperation[] = [];
  const root: Record<string, unknown> = {};
  for (const key of fields) if ((base[key] ?? null) !== (draft[key] ?? null)) root[key] = draft[key] ?? null;
  if (Object.keys(root).length) operations.push({ type: "updateContent", fields: root });
  for (const item of draft.mediaItems) {
    const before = base.mediaItems.find((candidate) => candidate.id === item.id);
    if (!before) continue;
    const changes: Record<string, unknown> = {};
    for (const key of mediaFields) if (before[key] !== item[key]) changes[key] = item[key];
    if (Object.keys(changes).length) operations.push({ type: "updateMediaItem", itemId: item.id, fields: changes });
  }
  return operations;
}

export function preserveDraftEdits(base: ContentRecord, draft: ContentRecord, latest: ContentRecord): ContentRecord {
  const result = { ...latest, mediaItems: latest.mediaItems.map((item) => ({ ...item })) };
  for (const operation of draftOperations(base, draft)) {
    if (operation.type === "updateContent") Object.assign(result, operation.fields);
    if (operation.type === "updateMediaItem") {
      const target = result.mediaItems.find((item) => item.id === operation.itemId);
      if (!target) throw new Error("An edited media item was removed");
      Object.assign(target, operation.fields);
    }
  }
  return result;
}

export function generationActive(status?: string | null): boolean {
  return !!status && ["QUEUED", "STARTING", "GENERATING", "PROCESSING"].includes(status);
}
export function conversationActive(status?: string | null): boolean {
  return !!status && ["QUEUED", "RUNNING", "DISPATCHING"].includes(status);
}
export function scheduleInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (Number(time.slice(3)) % 30 !== 0) return null;
  const day = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}
