import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRecord, ConversationTurnInput } from "@markos/shared-types";
const state = vi.hoisted(() => ({ data: new Map<string, string>(), epoch: 1, fail: false, beforeWrite: null as (() => Promise<void>) | null }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => state.data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (state.beforeWrite) await state.beforeWrite();
      if (state.fail) throw new Error("Disk full");
      state.data.set(key, value);
    },
    removeItem: async (key: string) => {
      state.data.delete(key);
    },
    getAllKeys: async () => [...state.data.keys()],
    multiRemove: async (keys: string[]) => {
      keys.forEach((key) => state.data.delete(key));
    }
  }
}));
vi.mock("../src/auth/transport", () => ({
  sessionController: {
    assertEpoch: (epoch: number) => {
      if (epoch !== state.epoch) throw new Error("Identity changed");
    }
  }
}));
import { clearStudioDeviceData, restoreEditor, StudioDeviceStore } from "../src/studio/device-store";
const base: ContentRecord = {
  id: "post",
  workspaceId: "workspace",
  contentType: "REEL",
  status: "DRAFT",
  revision: 1,
  caption: "Original",
  brief: "Event",
  reelScript: null,
  createdAt: "2026-09-22T10:00:00Z",
  updatedAt: "2026-09-22T10:00:00Z",
  mediaItems: [
    {
      id: "slot",
      workspaceId: "workspace",
      contentItemId: "post",
      position: 0,
      mediaKind: "VIDEO",
      mediaAssetId: null,
      title: null,
      body: null,
      purpose: null,
      visualDirection: "Flowers",
      aspectRatio: "VERTICAL",
      generationDurationSeconds: 8,
      createdAt: "2026-09-22T10:00:00Z",
      updatedAt: "2026-09-22T10:00:00Z"
    }
  ]
};
const draft = { ...base, caption: "Blooms in Pink · معًا من أجل الوعي" };
const intent: ConversationTurnInput = { requestId: "request-one", expectedRevision: 1, message: "Create the caption", locale: "en" };
const store = () => new StudioDeviceStore("host:user:workspace", 1, "post", "workspace");
beforeEach(() => {
  state.data.clear();
  state.epoch = 1;
  state.fail = false;
  state.beforeWrite = null;
});

describe("device editor and message recovery", () => {
  it("restores exact Motion Reel cards by content and media slot and clears them on logout", async () => {
    const settings = { artworkId: "artwork", cards: ["Blooms in Pink", "معًا من أجل الوعي", ""] };
    await store().saveMotion("slot", settings);
    expect(await store().readMotion("slot")).toEqual(settings);
    expect((await store().readMotion("different-slot")).artworkId).toBeNull();
    expect((await new StudioDeviceStore("host:other:workspace", 1, "post", "workspace").readMotion("slot")).artworkId).toBeNull();
    await clearStudioDeviceData("host:user:workspace");
    expect((await store().readMotion("slot")).artworkId).toBeNull();
  });
  it("restores exact bilingual edits on reopening and isolates account, workspace and content", async () => {
    await store().saveEditor(base, draft);
    expect((await store().readEditor())?.draft.caption).toBe(draft.caption);
    expect(await new StudioDeviceStore("host:other:workspace", 1, "post", "workspace").readEditor()).toBeNull();
    expect(await new StudioDeviceStore("host:user:other", 1, "post", "other").readEditor()).toBeNull();
    expect(await new StudioDeviceStore("host:user:workspace", 1, "different", "workspace").readEditor()).toBeNull();
    await expect(store().saveEditor(base, { ...draft, workspaceId: "other" })).rejects.toThrow("identity");
  });
  it("retains local text for conflict review and recognizes a Save whose response was lost", async () => {
    const saved = { version: 1 as const, base, draft };
    const remote = { ...base, revision: 3, updatedAt: "2026-09-22T11:00:00Z", mediaItems: [{ ...base.mediaItems[0]!, mediaAssetId: "new-video" }] };
    expect(restoreEditor(saved, remote)).toEqual({ base, draft, remote });
    expect(restoreEditor(saved, { ...remote, caption: draft.caption })).toEqual({
      base: { ...remote, caption: draft.caption },
      draft: { ...remote, caption: draft.caption },
      remote: null
    });
    const slideDraft = { ...draft, mediaItems: [{ ...draft.mediaItems[0]!, title: "Recover this deleted slide" }] };
    expect(restoreEditor({ ...saved, draft: slideDraft }, { ...remote, mediaItems: [] }).draft.mediaItems[0]?.title).toBe("Recover this deleted slide");
  });
  it("orders rapid edits, then clears the device copy after a server Save or deliberate discard", async () => {
    await Promise.all([store().saveEditor(base, draft), store().saveEditor(base, { ...draft, caption: "Latest" })]);
    expect((await store().readEditor())?.draft.caption).toBe("Latest");
    await store().saveEditor(draft, draft);
    expect(await store().readEditor()).toBeNull();
    await store().saveEditor(base, draft);
    await store().clearEditor();
    expect(await store().readEditor()).toBeNull();
  });
  it("does not claim a failed write was saved and can recover on a later successful write", async () => {
    await store().saveEditor(base, draft);
    state.fail = true;
    await expect(store().saveEditor(base, { ...draft, caption: "New edit" })).rejects.toThrow("Disk full");
    expect((await store().readEditor())?.draft.caption).toBe(draft.caption);
    state.fail = false;
    await store().saveEditor(base, { ...draft, caption: "Recovered" });
    expect((await store().readEditor())?.draft.caption).toBe("Recovered");
  });
  it("restores an unsent message and a submitted intent without a late receipt erasing the next message", async () => {
    await store().saveMessage("مسودة الرسالة");
    expect((await store().readMessage()).text).toBe("مسودة الرسالة");
    await store().startMessage(intent);
    expect((await store().readMessage()).pending).toEqual(intent);
    expect(await store().finishMessage(intent.requestId)).toBe(true);
    await store().saveMessage("Next message");
    expect(await store().finishMessage(intent.requestId)).toBe(false);
    expect((await store().readMessage()).text).toBe("Next message");
    const next = { ...intent, requestId: "next" };
    await store().startMessage(next);
    expect(await store().finishMessage(intent.requestId)).toBe(false);
    expect((await store().readMessage()).pending).toEqual(next);
    expect(await store().editRejectedMessage("next")).toBe(next.message);
    expect((await store().readMessage()).text).toBe(next.message);
  });
  it("migrates a submitted intent from the previous installer and rejects malformed saved work", async () => {
    const legacy = "markos.turn.host:user:workspace.post";
    state.data.set(legacy, JSON.stringify(intent));
    expect((await store().readMessage()).pending).toEqual(intent);
    await store().finishMessage(intent.requestId);
    expect(state.data.has(legacy)).toBe(false);
    state.data.set("markos.editor.host:user:workspace.post", "broken-json");
    await expect(store().readEditor()).rejects.toThrow();
    expect(state.data.get("markos.editor.host:user:workspace.post")).toBe("broken-json");
  });
  it("logout waits for an in-flight write, clears only this identity and rejects late writes", async () => {
    await new StudioDeviceStore("host:other:workspace", 1, "post", "workspace").saveEditor(base, draft);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    state.beforeWrite = async () => {
      started();
      await blocked;
    };
    const write = store().saveEditor(base, draft);
    const rejection = expect(write).rejects.toThrow("Identity changed");
    await entered;
    state.epoch = 2;
    const logout = clearStudioDeviceData("host:user:workspace");
    release();
    await rejection;
    await logout;
    await expect(store().saveMessage("Late text")).rejects.toThrow("Identity changed");
    expect([...state.data.keys()]).toEqual(["markos.editor.host:other:workspace.post"]);
  });
});
