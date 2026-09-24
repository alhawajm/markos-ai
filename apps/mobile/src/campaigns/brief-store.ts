import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import type { CampaignReferenceFileInput } from "@markos/shared-types";
import { mimeByExtension, newBrief, ownedReferenceUri, validDate, validateReferences, type Brief, type Reference } from "./brief-model";
import { sessionController } from "../auth/transport";

export class ReferenceError extends Error {}
const stores = new Map<string, BriefStore>();
export function briefStore(scope: string, epoch: number): BriefStore {
  const key = `${scope}:${epoch}`;
  let value = stores.get(key);
  if (!value) {
    value = new BriefStore(scope, epoch);
    stores.set(key, value);
  }
  return value;
}
export class BriefStore {
  private readonly key: string;
  private readonly directory: Directory;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    scope: string,
    private epoch: number,
    purpose: "campaign" | "onboarding" = "campaign"
  ) {
    this.key = purpose === "campaign" ? `markos.brief.${scope}` : `markos.onboarding-files.${scope}`;
    this.directory = new Directory(Paths.document, purpose === "campaign" ? "campaign-briefs" : "onboarding-files", encodeURIComponent(scope));
  }
  async read(): Promise<Brief> {
    const raw = await AsyncStorage.getItem(this.key);
    this.check();
    if (!raw) return newBrief();
    try {
      const value = JSON.parse(raw) as Brief;
      if (typeof value.objective !== "string" || typeof value.description !== "string" || !Array.isArray(value.files) || !validDate(value.startDate))
        throw new Error("Invalid brief");
      if (![3, 7, 14].includes(value.durationDays) || ![1, 2, 3].includes(value.publishesPerDay) || validateReferences(value.files))
        throw new Error("Invalid brief");
      // Restore only files that belong to this identity; missing OS files remain visible for removal.
      value.files = value.files.filter((file) => ownedReferenceUri(this.directory.uri, file.uri));
      return value;
    } catch {
      return newBrief();
    }
  }
  save(brief: Brief): Promise<void> {
    return this.enqueue(async () => {
      this.check();
      await AsyncStorage.setItem(this.key, JSON.stringify(brief));
    });
  }
  async pick(existing: Reference[]): Promise<Reference[]> {
    this.check();
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: Object.values(mimeByExtension) });
    this.check();
    if (result.canceled) return existing;
    const candidates = result.assets.map((asset) => {
      const extension = asset.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = mimeByExtension[extension];
      if (!mimeType) throw new ReferenceError("type");
      const source = new File(asset.uri);
      return { asset, extension, source, file: { filename: asset.name, mimeType, sizeBytes: source.size } };
    });
    const issue = validateReferences([...existing, ...candidates.map((candidate) => candidate.file)]);
    if (issue) throw new ReferenceError(issue);
    this.directory.create({ intermediates: true, idempotent: true });
    const copied: Reference[] = [];
    try {
      for (const candidate of candidates) {
        this.check();
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const file = new File(this.directory, `${id}.${candidate.extension}`);
        copied.push({ id, uri: file.uri, ...candidate.file });
        await candidate.source.copy(file);
        this.check();
      }
      return [...existing, ...copied];
    } catch (error) {
      copied.forEach((file) => this.remove(file));
      throw error;
    }
  }
  remove(reference: Reference): void {
    if (!ownedReferenceUri(this.directory.uri, reference.uri)) return;
    const file = new File(reference.uri);
    if (file.exists) file.delete();
  }
  async upload(files: Reference[]): Promise<CampaignReferenceFileInput[]> {
    this.check();
    const issue = validateReferences(files);
    if (issue) throw new ReferenceError(issue);
    const result: CampaignReferenceFileInput[] = [];
    for (const reference of files) {
      this.check();
      if (!ownedReferenceUri(this.directory.uri, reference.uri)) throw new ReferenceError("missing");
      const file = new File(reference.uri);
      if (!file.exists || file.size !== reference.sizeBytes) throw new ReferenceError("missing");
      result.push({ filename: reference.filename, mimeType: reference.mimeType, base64Data: await file.base64() });
    }
    this.check();
    return result;
  }
  clear(): Promise<void> {
    return this.enqueue(async () => {
      await AsyncStorage.removeItem(this.key);
      // The target is the exact per-account directory constructed above; never a caller-supplied path.
      if (this.directory.exists) this.directory.delete();
    });
  }
  private check() {
    sessionController.assertEpoch(this.epoch);
  }
  finishRequest(requestId: string, completed: boolean): Promise<void> {
    return this.enqueue(async () => {
      this.check();
      const current = await this.read();
      if (current.requestId !== requestId) return;
      if (completed) {
        await AsyncStorage.removeItem(this.key);
        if (this.directory.exists) this.directory.delete();
      } else {
        const { requestId: _id, requestLocale: _locale, pendingSince: _time, ...brief } = current;
        await AsyncStorage.setItem(this.key, JSON.stringify(brief));
      }
    });
  }
  private enqueue(task: () => Promise<void>) {
    const pending = this.writes.catch(() => {}).then(task);
    this.writes = pending;
    return pending;
  }
}
