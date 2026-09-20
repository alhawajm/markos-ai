import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateSaveCoordinator, applyLocalEdit, selectedMediaId, type AuthoringOperation } from "../app/[locale]/_components/create-save-coordinator";
import { draft, item } from "./create-fixtures";
import type { ContentRecord } from "@markos/shared-types";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
function harness() {
  let saved = draft();
  const mutate = vi.fn(async (revision: number, operations: AuthoringOperation[]) => {
    expect(revision).toBe(saved.revision);
    for (const op of operations) {
      if (op.type === "updateContent") saved = { ...saved, ...op.fields } as ContentRecord;
      if (op.type === "updateMediaItem")
        saved = { ...saved, mediaItems: saved.mediaItems.map((i) => (i.id === op.itemId ? { ...i, ...op.fields } : i)) } as ContentRecord;
    }
    saved = { ...saved, revision: saved.revision + 1 };
    return saved;
  });
  const state = new CreateSaveCoordinator(saved, mutate, () => {}, 100);
  return {
    state,
    mutate,
    get saved() {
      return saved;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe("Create serialized autosave", () => {
  it("debounces keystrokes and saves the latest text", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.state.edit({ kind: "content", field: "caption", value: "A" });
    await vi.advanceTimersByTimeAsync(60);
    h.state.edit({ kind: "content", field: "caption", value: "AB" });
    await vi.advanceTimersByTimeAsync(99);
    expect(h.mutate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.saved.caption).toBe("AB");
    expect(h.state.status).toBe("saved");
    h.state.dispose();
  });
  it.each(["assistant", "generation", "structural", "ready", "conversion", "navigation"])("flushes before %s observes the root revision", async () => {
    const h = harness();
    h.state.edit({ kind: "content", field: "caption", value: "Latest" });
    await h.state.action(async (current) => {
      expect(current.caption).toBe("Latest");
      expect(current.revision).toBe(3);
      return { result: null };
    });
    expect(h.mutate).toHaveBeenCalledTimes(1);
    h.state.dispose();
  });
  it("does not let an older save response erase input typed in flight; saves it serially", async () => {
    const first = deferred<ContentRecord>();
    const second = deferred<ContentRecord>();
    const mutate = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const state = new CreateSaveCoordinator(draft(), mutate, () => {});
    state.edit({ kind: "content", field: "caption", value: "First" });
    const flushed = state.flush();
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    state.edit({ kind: "content", field: "caption", value: "Newer" });
    first.resolve(draft({ revision: 3, caption: "First" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(state.record.caption).toBe("Newer");
    expect(mutate.mock.calls[1]?.[0]).toBe(3);
    second.resolve(draft({ revision: 4, caption: "Newer" }));
    await flushed;
    expect(state.record.caption).toBe("Newer");
    state.dispose();
  });
  it("does not resume a stale save over a newer remote update and in-flight keystrokes", async () => {
    const saving = deferred<ContentRecord>();
    const mutate = vi.fn().mockReturnValue(saving.promise);
    const state = new CreateSaveCoordinator(draft(), mutate, () => {});
    state.edit({ kind: "content", field: "caption", value: "First" });
    const flush = state.flush();
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    state.edit({ kind: "content", field: "caption", value: "Keep my newer typing" });
    state.receive(draft({ revision: 5, caption: "External update" }));
    saving.resolve(draft({ revision: 3, caption: "First" }));
    await expect(flush).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    expect(state.record.caption).toBe("Keep my newer typing");
    expect(state.revision).toBe(5);
    expect(mutate).toHaveBeenCalledTimes(1);
    state.dispose();
  });
  it("serializes structural operations after in-flight text and queued edits", async () => {
    const h = harness(),
      events: string[] = [];
    h.state.edit({ kind: "content", field: "brief", value: "Owner direction" });
    await Promise.all([
      h.state.action(async (r) => {
        events.push("add");
        return { result: 0, record: { ...r, revision: r.revision + 1 } };
      }),
      h.state.action(async (r) => {
        events.push("reorder");
        expect(r.brief).toBe("Owner direction");
        expect(r.revision).toBe(4);
        return { result: 0 };
      })
    ]);
    expect(events).toEqual(["add", "reorder"]);
    h.state.dispose();
  });
  it("preserves local input on revision conflict and requires explicit reconciliation", async () => {
    const mutate = vi
      .fn()
      .mockRejectedValueOnce({ code: "CONTENT_REVISION_CONFLICT" })
      .mockResolvedValueOnce(draft({ revision: 9, caption: "Local" }));
    const state = new CreateSaveCoordinator(draft(), mutate, () => {});
    state.edit({ kind: "content", field: "caption", value: "Local" });
    await expect(state.flush()).rejects.toBeDefined();
    expect(state.status).toBe("conflict");
    expect(state.record.caption).toBe("Local");
    state.receive(draft({ revision: 8, caption: "Remote" }));
    expect(state.record.caption).toBe("Local");
    await expect(state.flush()).rejects.toBeDefined();
    expect(mutate).toHaveBeenCalledTimes(1);
    await state.resolve(draft({ revision: 8, caption: "Remote" }), true);
    expect(mutate.mock.calls[1]?.[0]).toBe(8);
    state.dispose();
  });
  it("merges assistant changes on unrelated fields without erasing pending input; ignores stale polls", async () => {
    const h = harness();
    h.state.edit({ kind: "content", field: "caption", value: "Local" });
    h.state.receive(draft({ revision: 7, tone: "AI tone" }));
    expect(h.state.record).toMatchObject({ caption: "Local", tone: "AI tone" });
    h.state.receive(draft({ revision: 4, caption: "Stale" }));
    expect(h.state.record.caption).toBe("Local");
    expect(h.state.revision).toBe(7);
    h.state.dispose();
  });
  it("stops autosave if an assistant changed the same field since typing started", async () => {
    const h = harness();
    h.state.edit({ kind: "media", id: "item-1", field: "visualDirection", value: "Local direction" });
    h.state.receive(draft({ revision: 5, mediaItems: [{ ...item(), visualDirection: "AI direction" }] }));
    expect(h.state.status).toBe("conflict");
    expect(h.state.record.mediaItems[0]?.visualDirection).toBe("Local direction");
    await expect(h.state.flush()).rejects.toThrow();
    expect(h.mutate).not.toHaveBeenCalled();
    h.state.dispose();
  });
  it("retains orphaned input when AI removes its target; never writes it onto another slide", async () => {
    const h = harness();
    h.state.edit({ kind: "media", id: "item-1", field: "title", value: "Preserve me" });
    const remote = draft({ revision: 9, mediaItems: [item("other")] });
    h.state.receive(remote);
    await expect(h.state.resolve(remote, true)).rejects.toThrow("removed or locked");
    expect(h.state.recoveryEdits[0]?.value).toBe("Preserve me");
    await h.state.resolve(remote, false);
    expect(h.state.recoveryEdits).toEqual([]);
    h.state.dispose();
  });
  it("keeps stable selection after reorder and replacement, then falls back after removal", () => {
    const a = item(),
      b = item("item-2");
    const current = draft({ contentType: "CAROUSEL", mediaItems: [b, { ...a, mediaAssetId: "new-asset" }] });
    expect(selectedMediaId(current, a.id)).toBe(a.id);
    expect(selectedMediaId({ ...current, mediaItems: [b] }, a.id)).toBe(b.id);
  });
  it("receives newer worker publication state at the same authoring revision without reverting it on a stale poll", () => {
    const state = new CreateSaveCoordinator(draft({ status: "APPROVED" }), vi.fn(), () => {});
    state.receive(draft({ status: "PUBLISHED", updatedAt: "2026-09-16T01:00:00Z" }));
    expect(state.record.status).toBe("PUBLISHED");
    expect(state.revision).toBe(2);
    state.receive(draft({ status: "APPROVED" }));
    expect(state.record.status).toBe("PUBLISHED");
    state.dispose();
  });
  it("local script and beat patches never modify clip duration", () => {
    const record = draft({
      contentType: "REEL",
      mediaItems: [{ ...item(), mediaKind: "VIDEO", generationDurationSeconds: 8 }],
      reelScript: {
        id: "script",
        contentItemId: "draft-1",
        workspaceId: "workspace-1",
        hook: null,
        intendedDurationSeconds: 30,
        beats: [{ id: "beat", text: "Old", position: 0, reelScriptId: "script", workspaceId: "workspace-1", createdAt: "", updatedAt: "" }],
        createdAt: "",
        updatedAt: ""
      }
    });
    const updated = applyLocalEdit(applyLocalEdit(record, { kind: "beat", id: "beat", field: "text", value: "New" }), {
      kind: "script",
      field: "intendedDurationSeconds",
      value: 45
    });
    expect(updated.reelScript?.beats[0]?.text).toBe("New");
    expect(updated.reelScript?.intendedDurationSeconds).toBe(45);
    expect(updated.mediaItems[0]?.generationDurationSeconds).toBe(8);
  });
  it("does not edit locked content or discard pending text on save failure", async () => {
    const mutate = vi.fn();
    const locked = new CreateSaveCoordinator(draft({ status: "PUBLISHED" }), mutate, () => {});
    locked.edit({ kind: "content", field: "caption", value: "Forbidden" });
    await locked.flush();
    expect(mutate).not.toHaveBeenCalled();
    const failed = new CreateSaveCoordinator(draft(), vi.fn().mockRejectedValue(new Error("Offline")), () => {});
    failed.edit({ kind: "content", field: "brief", value: "Keep" });
    await expect(failed.flush()).rejects.toThrow("Offline");
    expect(failed.record.brief).toBe("Keep");
    expect(failed.status).toBe("failed");
    failed.dispose();
    locked.dispose();
  });
});
