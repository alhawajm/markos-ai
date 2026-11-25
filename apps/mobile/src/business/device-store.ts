import AsyncStorage from "@react-native-async-storage/async-storage";
import { sessionController } from "../auth/transport";
import { BriefStore } from "../campaigns/brief-store";
import { Directory, Paths } from "expo-file-system";
const writes = new Map<string, Promise<unknown>>();
function enqueue<T>(scope: string, task: () => Promise<T>): Promise<T> {
  const pending = (writes.get(scope) ?? Promise.resolve()).catch(() => {}).then(task);
  writes.set(scope, pending);
  void pending
    .finally(() => {
      if (writes.get(scope) === pending) writes.delete(scope);
    })
    .catch(() => {});
  return pending;
}
export class BusinessDeviceStore<T> {
  readonly files: BriefStore;
  private key: string;
  constructor(
    private scope: string,
    private epoch: number,
    kind:
      | "setup"
      | "profile"
      | "quick-setup"
      | "assistant"
      | "assistant-content"
      | "assistant-campaign"
      | "assistant-strategy"
      | "assistant-navigation"
      | "post-design",
    partition?: string
  ) {
    this.key = `markos.business.${kind}.${scope}${partition ? `:chat:${partition}` : ""}`;
    this.files = new BriefStore(scope, epoch, "onboarding");
  }
  private task<R>(work: () => Promise<R>): Promise<R> {
    return enqueue(this.scope, async () => {
      sessionController.assertEpoch(this.epoch);
      const result = await work();
      sessionController.assertEpoch(this.epoch);
      return result;
    });
  }
  read(): Promise<T | null> {
    return this.task(async () => {
      const raw = await AsyncStorage.getItem(this.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== 1) throw new Error("Unsupported draft");
      return data.value as T;
    });
  }
  save(value: T): Promise<void> {
    const raw = JSON.stringify({ version: 1, value });
    return this.task(() => AsyncStorage.setItem(this.key, raw));
  }
  clear(): Promise<void> {
    return this.task(() => AsyncStorage.removeItem(this.key));
  }
}
export function clearBusinessDeviceData(scope: string, epoch: number): Promise<void> {
  return enqueue(scope, async () => {
    const roots = [
      `markos.business.setup.${scope}`,
      `markos.business.profile.${scope}`,
      `markos.business.quick-setup.${scope}`,
      `markos.business.assistant.${scope}`,
      `markos.business.assistant-content.${scope}`,
      `markos.business.assistant-campaign.${scope}`,
      `markos.business.assistant-strategy.${scope}`,
      `markos.business.assistant-navigation.${scope}`,
      `markos.business.post-design.${scope}`
    ];
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove([...new Set([...roots, ...keys.filter((key) => roots.some((root) => key.startsWith(`${root}:chat:`)))])]);
    await new BriefStore(scope, epoch, "onboarding").clear();
    const postDesigns = new Directory(Paths.document, "post-designs", encodeURIComponent(scope));
    if (postDesigns.exists) postDesigns.delete();
  });
}
