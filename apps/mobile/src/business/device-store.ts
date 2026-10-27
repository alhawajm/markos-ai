import AsyncStorage from "@react-native-async-storage/async-storage";
import { sessionController } from "../auth/transport";
import { BriefStore } from "../campaigns/brief-store";
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
    kind: "setup" | "profile"
  ) {
    this.key = `markos.business.${kind}.${scope}`;
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
    await AsyncStorage.multiRemove([`markos.business.setup.${scope}`, `markos.business.profile.${scope}`]);
    await new BriefStore(scope, epoch, "onboarding").clear();
  });
}
