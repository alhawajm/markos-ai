import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: new Map<string, string>(), epoch: 1, wait: null as Promise<void> | null, deleted: [] as string[] }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => state.data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (state.wait) await state.wait;
      state.data.set(key, value);
    },
    removeItem: async (key: string) => {
      state.data.delete(key);
    },
    multiRemove: async (keys: string[]) => {
      keys.forEach((key) => state.data.delete(key));
    }
  }
}));
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file:///app" },
  Directory: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    delete() {
      state.deleted.push(this.uri);
    }
  },
  File: class {}
}));
vi.mock("../src/auth/transport", () => ({
  sessionController: {
    assertEpoch: (epoch: number) => {
      if (epoch !== state.epoch) throw new Error("Identity changed");
    }
  }
}));
import { BusinessDeviceStore, clearBusinessDeviceData } from "../src/business/device-store";
beforeEach(() => {
  state.data.clear();
  state.epoch = 1;
  state.wait = null;
  state.deleted = [];
});
describe("business device draft ownership", () => {
  it("restores bilingual edits separately by API, account, workspace and setup/profile flow", async () => {
    const value = { title: "Blooms · أزهار", colors: ["#FFAACC"] };
    await new BusinessDeviceStore("host:user:workspace", 1, "setup").save(value);
    expect(await new BusinessDeviceStore("host:user:workspace", 1, "setup").read()).toEqual(value);
    for (const scope of ["other:user:workspace", "host:other:workspace", "host:user:other"])
      expect(await new BusinessDeviceStore(scope, 1, "setup").read()).toBeNull();
    expect(await new BusinessDeviceStore("host:user:workspace", 1, "profile").read()).toBeNull();
  });
  it("logout waits for earlier writes, removes only this identity, and blocks late writes", async () => {
    await new BusinessDeviceStore("other", 1, "setup").save({ name: "Keep" });
    let release!: () => void;
    state.wait = new Promise((resolve) => {
      release = resolve;
    });
    const store = new BusinessDeviceStore("current", 1, "setup");
    const pending = store.save({ name: "Pending" });
    const rejected = expect(pending).rejects.toThrow("Identity changed");
    await Promise.resolve();
    await Promise.resolve();
    state.epoch = 2;
    const cleanup = clearBusinessDeviceData("current", 1);
    release();
    await rejected;
    await cleanup;
    expect(state.data.has("markos.business.setup.current")).toBe(false);
    expect(state.data.has("markos.business.setup.other")).toBe(true);
    expect(state.deleted).toEqual(["file:///app/onboarding-files/current"]);
    await expect(store.save({ name: "Late" })).rejects.toThrow("Identity changed");
  });
  it("finishes queued edits before clearing a successfully saved draft", async () => {
    const store = new BusinessDeviceStore("current", 1, "profile");
    const first = store.save({ name: "One" });
    const second = store.save({ name: "Two" });
    const clear = store.clear();
    await Promise.all([first, second, clear]);
    expect(await store.read()).toBeNull();
  });
});
