import type { ContentAuthoringOperation, ContentRecord } from "@markos/shared-types";

const fields = ["caption", "brief", "contentPillar", "campaignGoal", "tone", "plannedAt"] as const;
const mediaFields = ["purpose", "title", "body", "visualDirection", "aspectRatio", "generationDurationSeconds"] as const;
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
  const scriptFields: Record<string, unknown> = {};
  for (const key of ["hook", "intendedDurationSeconds"] as const) {
    if ((base.reelScript?.[key] ?? null) !== (draft.reelScript?.[key] ?? null)) scriptFields[key] = draft.reelScript?.[key] ?? null;
  }
  if (Object.keys(scriptFields).length) operations.push({ type: "updateReelScript", fields: scriptFields });
  for (const beat of draft.reelScript?.beats ?? []) {
    const before = base.reelScript?.beats.find((value) => value.id === beat.id);
    if (before && before.text !== beat.text) operations.push({ type: "updateReelBeat", beatId: beat.id, text: beat.text });
  }
  return operations;
}

export function preserveDraftEdits(base: ContentRecord, draft: ContentRecord, latest: ContentRecord): ContentRecord {
  const result = {
    ...latest,
    mediaItems: latest.mediaItems.map((item) => ({ ...item })),
    reelScript: latest.reelScript ? { ...latest.reelScript, beats: latest.reelScript.beats.map((beat) => ({ ...beat })) } : null
  };
  for (const operation of draftOperations(base, draft)) {
    if (operation.type === "updateContent") Object.assign(result, operation.fields);
    if (operation.type === "updateMediaItem") {
      const target = result.mediaItems.find((item) => item.id === operation.itemId);
      if (!target) throw new Error("An edited media item was removed");
      Object.assign(target, operation.fields);
    }
    if (operation.type === "updateReelScript") {
      if (!result.reelScript) throw new Error("The edited Reel script was removed");
      Object.assign(result.reelScript, operation.fields);
    }
    if (operation.type === "updateReelBeat") {
      const beat = result.reelScript?.beats.find((value) => value.id === operation.beatId);
      if (!beat) throw new Error("An edited Reel beat was removed");
      beat.text = operation.text;
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
