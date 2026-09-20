import type { ContentRecord } from "@markos/shared-types";
import type { ContentMutationInput } from "@markos/validation";

export type AuthoringOperation = ContentMutationInput["operations"][number];
export type FieldEdit =
  | { kind: "content"; field: "caption" | "brief" | "contentPillar" | "campaignGoal" | "tone"; value: string }
  | {
      kind: "media";
      id: string;
      field: "purpose" | "title" | "body" | "visualDirection" | "aspectRatio" | "generationDurationSeconds";
      value: string | number | null;
    }
  | { kind: "script"; field: "hook" | "intendedDurationSeconds"; value: string | number | null }
  | { kind: "beat"; id: string; field: "text"; value: string };
type Pending = { edit: FieldEdit; base: unknown; ticket: number };
export type SaveStatus = "saved" | "pending" | "saving" | "failed" | "conflict";
const key = (edit: FieldEdit) => `${edit.kind}:${"id" in edit ? edit.id : ""}:${edit.field}`;
export function fieldValue(record: ContentRecord, edit: FieldEdit): unknown {
  if (edit.kind === "content") return record[edit.field] ?? "";
  if (edit.kind === "media") return record.mediaItems.find((item) => item.id === edit.id)?.[edit.field] ?? null;
  if (edit.kind === "script") return record.reelScript?.[edit.field] ?? null;
  return record.reelScript?.beats.find((beat) => beat.id === edit.id)?.text ?? null;
}
const equal = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");
export function editOperation(edit: FieldEdit): AuthoringOperation {
  if (edit.kind === "content") return { type: "updateContent", fields: { [edit.field]: edit.value } };
  if (edit.kind === "media") return { type: "updateMediaItem", itemId: edit.id, fields: { [edit.field]: edit.value } };
  if (edit.kind === "script") return { type: "updateReelScript", fields: { [edit.field]: edit.value } };
  return { type: "updateReelBeat", beatId: edit.id, text: edit.value };
}
export function applyLocalEdit(record: ContentRecord, edit: FieldEdit): ContentRecord {
  if (edit.kind === "content") return { ...record, [edit.field]: edit.value };
  if (edit.kind === "media")
    return { ...record, mediaItems: record.mediaItems.map((item) => (item.id === edit.id ? { ...item, [edit.field]: edit.value } : item)) };
  if (edit.kind === "beat")
    return {
      ...record,
      reelScript: record.reelScript
        ? { ...record.reelScript, beats: record.reelScript.beats.map((beat) => (beat.id === edit.id ? { ...beat, text: edit.value } : beat)) }
        : null
    };
  return {
    ...record,
    reelScript: {
      id: "",
      workspaceId: record.workspaceId,
      contentItemId: record.id,
      hook: null,
      intendedDurationSeconds: null,
      beats: [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...record.reelScript,
      [edit.field]: edit.value
    }
  };
}
export const selectedMediaId = (record: ContentRecord, current: string | null) =>
  record.mediaItems.some((item) => item.id === current) ? current! : (record.mediaItems[0]?.id ?? null);

/** One root revision, one serialized mutation queue. Tickets identify local keystrokes,
 * never replace the server revision or authorize concurrent writes. */
export class CreateSaveCoordinator {
  private server: ContentRecord;
  private pending = new Map<string, Pending>();
  private tail: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ticket = 0;
  private disposed = false;
  status: SaveStatus = "saved";
  error: unknown = null;
  constructor(
    record: ContentRecord,
    private mutate: (revision: number, operations: AuthoringOperation[]) => Promise<ContentRecord>,
    private notify: () => void,
    private delay = 600
  ) {
    this.server = record;
  }
  get record() {
    return [...this.pending.values()].reduce((record, p) => applyLocalEdit(record, p.edit), this.server);
  }
  get revision() {
    return this.server.revision;
  }
  get unsaved() {
    return this.pending.size > 0 || this.status === "saving";
  }
  get recoveryEdits() {
    return [...this.pending.values()].map((p) => p.edit);
  }
  get editable() {
    return ["DRAFT", "IN_REVIEW"].includes(this.server.status);
  }
  edit(edit: FieldEdit) {
    if (!this.editable || this.disposed) return;
    const id = key(edit),
      old = this.pending.get(id);
    this.pending.set(id, { edit, base: old?.base ?? fieldValue(this.server, edit), ticket: ++this.ticket });
    if (this.status !== "conflict" && this.status !== "failed") {
      this.status = "pending";
      this.schedule();
    }
    this.notify();
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.catch(() => {}).then(work);
    this.tail = next;
    return next;
  }
  private fail(error: unknown) {
    this.error = error;
    this.status = typeof error === "object" && error !== null && "code" in error && error.code === "CONTENT_REVISION_CONFLICT" ? "conflict" : "failed";
    this.notify();
  }
  private async drain() {
    clearTimeout(this.timer);
    if (this.status === "conflict" || this.status === "failed") throw this.error ?? new Error("Resolve the save issue first.");
    while (this.pending.size) {
      if (!this.editable) throw new Error("This content is read-only.");
      const batch = [...this.pending.entries()];
      this.status = "saving";
      this.notify();
      try {
        const saved = await this.mutate(
          this.server.revision,
          batch.map(([, p]) => editOperation(p.edit))
        );
        for (const [id, sent] of batch) {
          const latest = this.pending.get(id);
          if (latest?.ticket === sent.ticket) this.pending.delete(id);
          else if (latest) latest.base = fieldValue(saved, latest.edit);
        }
        if (saved.revision >= this.server.revision) this.server = saved;
        if (
          [...this.pending.values()].some((p) => !this.targetExists(this.server, p.edit) || !equal(fieldValue(this.server, p.edit), p.base) || !this.editable)
        ) {
          throw Object.assign(new Error("The draft changed while saving. Your newer input is preserved."), { code: "CONTENT_REVISION_CONFLICT" });
        }
        this.status = this.pending.size ? "pending" : "saved";
        this.error = null;
        this.notify();
      } catch (error) {
        this.fail(error);
        throw error;
      }
    }
  }
  flush() {
    return this.serialize(() => this.drain());
  }
  async action<T>(perform: (current: ContentRecord) => Promise<{ result: T; record?: ContentRecord }>): Promise<T> {
    return this.serialize(async () => {
      await this.drain();
      try {
        const outcome = await perform(this.server);
        if (outcome.record) this.receive(outcome.record);
        return outcome.result;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "CONTENT_REVISION_CONFLICT") this.fail(error);
        throw error;
      }
    });
  }
  receive(remote: ContentRecord) {
    if (this.disposed || remote.id !== this.server.id || remote.revision < this.server.revision) return;
    // Worker publication status can advance without changing the authoring revision.
    // Never allow an older operational snapshot to replace a newer one.
    if (remote.revision === this.server.revision && Date.parse(remote.updatedAt) <= Date.parse(this.server.updatedAt)) return;
    let conflict = false;
    for (const p of this.pending.values()) {
      if (!equal(fieldValue(remote, p.edit), p.base) || !this.targetExists(remote, p.edit) || !["DRAFT", "IN_REVIEW"].includes(remote.status)) conflict = true;
    }
    this.server = remote;
    if (conflict) {
      clearTimeout(this.timer);
      this.status = "conflict";
      this.error = new Error("The draft changed. Your local input is preserved. Review before applying it.");
    }
    this.notify();
  }
  private targetExists(record: ContentRecord, edit: FieldEdit) {
    return edit.kind === "media"
      ? record.mediaItems.some((item) => item.id === edit.id)
      : edit.kind === "beat"
        ? !!record.reelScript?.beats.some((beat) => beat.id === edit.id)
        : edit.kind === "script"
          ? record.contentType === "REEL"
          : true;
  }
  async resolve(remote: ContentRecord, keepLocal: boolean) {
    await this.serialize(async () => {
      if (remote.id !== this.server.id) throw new Error("Wrong draft.");
      this.server = remote;
      if (keepLocal) {
        if (!this.editable || [...this.pending.values()].some((p) => !this.targetExists(remote, p.edit)))
          throw new Error("An edited item was removed or locked. Copy your preserved text before using the server version.");
        for (const p of this.pending.values()) p.base = fieldValue(remote, p.edit);
      } else this.pending.clear();
      this.error = null;
      this.status = this.pending.size ? "pending" : "saved";
      this.notify();
      await this.drain();
    });
  }
  retry() {
    if (this.status === "failed") {
      this.status = "pending";
      this.error = null;
    }
    return this.flush();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
