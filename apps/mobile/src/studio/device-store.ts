import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ContentRecord, ConversationTurnInput } from "@markos/shared-types";
import { sessionController } from "../auth/transport";
import { draftOperations, preserveDraftEdits } from "./model";

export type EditorSnapshot = { version: 1; base: ContentRecord; draft: ContentRecord };
export type MessageSnapshot = { version: 1; text: string; pending: ConversationTurnInput | null };
const writes = new Map<string, Promise<unknown>>();
function enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
  writes.set(key, pending);
  void pending
    .finally(() => {
      if (writes.get(key) === pending) writes.delete(key);
    })
    .catch(() => {});
  return pending;
}

/** All operations on one identity's drafts share a queue, including logout cleanup. */
export class StudioDeviceStore {
  private readonly editorKey: string;
  private readonly messageKey: string;
  constructor(
    private scope: string,
    private epoch: number,
    private contentId: string,
    private workspaceId: string
  ) {
    this.editorKey = `markos.editor.${scope}.${contentId}`;
    this.messageKey = `markos.message.${scope}.${contentId}`;
  }
  private task<T>(work: () => Promise<T>): Promise<T> {
    return enqueue(this.scope, async () => {
      sessionController.assertEpoch(this.epoch);
      const result = await work();
      sessionController.assertEpoch(this.epoch);
      return result;
    });
  }
  readEditor(): Promise<EditorSnapshot | null> {
    return this.task(async () => {
      const raw = await AsyncStorage.getItem(this.editorKey);
      if (!raw) return null;
      const value = JSON.parse(raw) as EditorSnapshot;
      if (value.version !== 1 || !validContent(value.base, this.contentId, this.workspaceId) || !validContent(value.draft, this.contentId, this.workspaceId))
        throw new Error("Invalid saved editor draft");
      return value;
    });
  }
  saveEditor(base: ContentRecord, draft: ContentRecord): Promise<void> {
    // Capture the exact edit at invocation, before any queued asynchronous work.
    const serialized = JSON.stringify({ version: 1, base, draft });
    const dirty = draftOperations(base, draft).length > 0;
    return this.task(async () => {
      if (!validContent(base, this.contentId, this.workspaceId) || !validContent(draft, this.contentId, this.workspaceId))
        throw new Error("Draft identity changed");
      if (dirty) await AsyncStorage.setItem(this.editorKey, serialized);
      else await AsyncStorage.removeItem(this.editorKey);
    });
  }
  clearEditor(): Promise<void> {
    return this.task(() => AsyncStorage.removeItem(this.editorKey));
  }
  readMessage(): Promise<MessageSnapshot> {
    return this.task(() => this.message());
  }
  private async message(): Promise<MessageSnapshot> {
    const raw = await AsyncStorage.getItem(this.messageKey);
    if (raw) {
      const value = JSON.parse(raw) as MessageSnapshot;
      if (value.version !== 1 || typeof value.text !== "string" || (value.pending !== null && !validIntent(value.pending)))
        throw new Error("Invalid saved message");
      return value;
    }
    // Preserve submitted messages from the original 0.2.0 installer.
    const legacy = await AsyncStorage.getItem(`markos.turn.${this.scope}.${this.contentId}`);
    if (!legacy) return { version: 1, text: "", pending: null };
    const pending: unknown = JSON.parse(legacy);
    if (!validIntent(pending)) throw new Error("Invalid saved message");
    return { version: 1, text: "", pending };
  }
  private async writeMessage(value: MessageSnapshot): Promise<void> {
    await AsyncStorage.setItem(this.messageKey, JSON.stringify(value));
    await AsyncStorage.removeItem(`markos.turn.${this.scope}.${this.contentId}`);
  }
  saveMessage(text: string): Promise<void> {
    return this.task(async () => this.writeMessage({ ...(await this.message()), text }));
  }
  startMessage(intent: ConversationTurnInput): Promise<void> {
    return this.task(async () => {
      const current = await this.message();
      if (current.pending && current.pending.requestId !== intent.requestId) throw new Error("Recover the pending message first");
      await this.writeMessage({ version: 1, text: "", pending: intent });
    });
  }
  finishMessage(requestId: string): Promise<boolean> {
    return this.task(async () => {
      const current = await this.message();
      if (current.pending?.requestId !== requestId) return false;
      await this.writeMessage({ ...current, pending: null });
      return true;
    });
  }
  editRejectedMessage(requestId: string): Promise<string | null> {
    return this.task(async () => {
      const current = await this.message();
      if (current.pending?.requestId !== requestId) return null;
      await this.writeMessage({ version: 1, text: current.pending.message, pending: null });
      return current.pending.message;
    });
  }
}
export async function clearStudioDeviceData(scope: string): Promise<void> {
  await enqueue(scope, async () => {
    const prefixes = ["editor", "message", "turn"].map((kind) => `markos.${kind}.${scope}.`);
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  });
}
function validIntent(value: unknown): value is ConversationTurnInput {
  if (!value || typeof value !== "object") return false;
  const item = value as ConversationTurnInput;
  return (
    typeof item.requestId === "string" && typeof item.message === "string" && Number.isInteger(item.expectedRevision) && ["en", "ar"].includes(item.locale)
  );
}
function validContent(value: unknown, id: string, workspaceId: string): value is ContentRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as ContentRecord;
  return (
    item.id === id &&
    item.workspaceId === workspaceId &&
    Number.isInteger(item.revision) &&
    typeof item.caption === "string" &&
    typeof item.updatedAt === "string" &&
    typeof item.status === "string" &&
    Array.isArray(item.mediaItems) &&
    item.mediaItems.every((media) => media && media.workspaceId === workspaceId && media.contentItemId === id && typeof media.id === "string")
  );
}
export function restoreEditor(saved: EditorSnapshot, latest: ContentRecord): { base: ContentRecord; draft: ContentRecord; remote: ContentRecord | null } {
  // An acknowledged-on-server/lost-on-device Save must not bring old edits back.
  try {
    const merged = preserveDraftEdits(saved.base, saved.draft, latest);
    if (!draftOperations(latest, merged).length) return { base: latest, draft: latest, remote: null };
  } catch {
    /* An edited slide was removed; keep its text available for recovery. */
  }
  return { base: saved.base, draft: saved.draft, remote: latest.revision !== saved.base.revision || latest.updatedAt !== saved.base.updatedAt ? latest : null };
}
