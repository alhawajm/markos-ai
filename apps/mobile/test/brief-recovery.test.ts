import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: new Map<string, string>(), epoch: 1 }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => state.data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      state.data.set(key, value);
    },
    removeItem: async (key: string) => {
      state.data.delete(key);
    }
  }
}));
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file:///app" },
  Directory: class {
    uri: string;
    exists = false;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    delete() {}
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
import { BriefStore } from "../src/campaigns/brief-store";
import { newBrief } from "../src/campaigns/brief-model";

beforeEach(() => {
  state.data.clear();
  state.epoch = 1;
});
describe("campaign device recovery", () => {
  it("restores the same request ID, locale and brief after reopening", async () => {
    const value = {
      ...newBrief(),
      objective: "Blooms",
      description: "تفاصيل الفعالية",
      requestId: "intent-1",
      requestLocale: "ar" as const,
      pendingSince: new Date().toISOString()
    };
    await new BriefStore("account-one", 1).save(value);
    expect(await new BriefStore("account-one", 1).read()).toEqual(value);
    expect((await new BriefStore("account-two", 1).read()).requestId).toBeUndefined();
  });
  it("does not erase a newer brief when an earlier job finishes", async () => {
    const store = new BriefStore("account-one", 1);
    await store.save({ ...newBrief(), objective: "Second campaign", requestId: "second" });
    await store.finishRequest("first", true);
    expect((await store.read()).objective).toBe("Second campaign");
  });
  it("retains the brief for a deliberate retry and clears only the completed submission", async () => {
    const store = new BriefStore("account-one", 1);
    await store.save({ ...newBrief(), objective: "Blooms", requestId: "first", requestLocale: "en" });
    await store.finishRequest("first", false);
    expect(await store.read()).toMatchObject({ objective: "Blooms" });
    expect((await store.read()).requestId).toBeUndefined();
    await store.save({ ...newBrief(), objective: "Blooms", requestId: "second" });
    await store.finishRequest("second", true);
    expect((await store.read()).objective).toBe("");
  });
  it("rejects late writes from the previous identity", async () => {
    const store = new BriefStore("account-one", 1);
    state.epoch = 2;
    await expect(store.save(newBrief())).rejects.toThrow("Identity changed");
    expect(state.data.size).toBe(0);
  });
});
