import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { listenForThemeChanges, setThemePreference, themeInitializationScript, THEME_STORAGE_KEY } from "../app/theme";

function browserFixture({ saved = null, dark = false, blockedStorage = false }: { saved?: string | null; dark?: boolean; blockedStorage?: boolean } = {}) {
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const storage = new Map<string, string>(saved === null ? [] : [[THEME_STORAGE_KEY, saved]]);
  const localStorage = {
    getItem: (key: string) => {
      if (blockedStorage) throw new Error("Storage is blocked");
      return storage.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blockedStorage) throw new Error("Storage is blocked");
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      if (blockedStorage) throw new Error("Storage is blocked");
      storage.delete(key);
    }
  };
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const mediaListeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener)
  };
  const target = {
    document: { documentElement: root },
    localStorage,
    matchMedia: () => media,
    dispatchEvent: vi.fn(),
    addEventListener: (name: string, listener: (event: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: (event: unknown) => void) => listeners.get(name)?.delete(listener)
  };
  return {
    target: target as unknown as Window,
    root,
    storage,
    boot: () => runInNewContext(themeInitializationScript, { document: target.document, localStorage, window: target }),
    systemChangesTo: (matches: boolean) => {
      media.matches = matches;
      mediaListeners.forEach((listener) => listener());
    },
    otherTabChangesTo: (key: string | null, newValue: string | null) => listeners.get("storage")?.forEach((listener) => listener({ key, newValue })),
    listenerCount: () => mediaListeners.size + (listeners.get("storage")?.size ?? 0)
  };
}

describe("site appearance", () => {
  it.each([
    { saved: "dark", dark: false, expected: "dark", preference: "dark" },
    { saved: "light", dark: true, expected: "light", preference: "light" },
    { saved: null, dark: true, expected: "dark", preference: "system" },
    { saved: "invalid", dark: false, expected: "light", preference: "system" }
  ])("sets $expected before hydration for stored $saved and system dark=$dark", ({ expected, preference, ...options }) => {
    const browser = browserFixture(options);
    browser.boot();
    expect(browser.root.dataset).toEqual({ theme: expected, themePreference: preference });
    expect(browser.root.style.colorScheme).toBe(expected);
  });

  it("persists an explicit choice across a fresh document and restores system behavior when selected", () => {
    const browser = browserFixture({ dark: true });
    browser.boot();
    const stop = listenForThemeChanges(browser.target);
    setThemePreference("light", browser.target);
    expect(browser.storage.get(THEME_STORAGE_KEY)).toBe("light");
    const refreshed = browserFixture({ dark: true, saved: browser.storage.get(THEME_STORAGE_KEY)! });
    refreshed.boot();
    expect(refreshed.root.dataset.theme).toBe("light");
    browser.systemChangesTo(false);
    browser.systemChangesTo(true);
    expect(browser.root.dataset.theme).toBe("light");
    setThemePreference("system", browser.target);
    expect(browser.storage.has(THEME_STORAGE_KEY)).toBe(false);
    expect(browser.root.dataset.theme).toBe("dark");
    browser.systemChangesTo(false);
    expect(browser.root.dataset.theme).toBe("light");
    stop();
    expect(browser.listenerCount()).toBe(0);
  });

  it("uses system appearance and permits a change for this visit when storage is blocked", () => {
    const browser = browserFixture({ blockedStorage: true, dark: true });
    expect(() => browser.boot()).not.toThrow();
    expect(browser.root.dataset.theme).toBe("dark");
    setThemePreference("light", browser.target);
    const stop = listenForThemeChanges(browser.target);
    browser.systemChangesTo(true);
    expect(browser.root.dataset.theme).toBe("light");
    stop();
  });

  it("synchronizes another tab's preference or reset without responding to unrelated keys", () => {
    const browser = browserFixture({ saved: "light", dark: true });
    browser.boot();
    const stop = listenForThemeChanges(browser.target);
    browser.otherTabChangesTo("unrelated", "dark");
    expect(browser.root.dataset.theme).toBe("light");
    browser.otherTabChangesTo(THEME_STORAGE_KEY, "dark");
    expect(browser.root.dataset.themePreference).toBe("dark");
    browser.otherTabChangesTo(THEME_STORAGE_KEY, null);
    expect(browser.root.dataset.themePreference).toBe("system");
    expect(browser.root.dataset.theme).toBe("dark");
    browser.otherTabChangesTo(THEME_STORAGE_KEY, "light");
    browser.otherTabChangesTo(null, null);
    expect(browser.root.dataset.themePreference).toBe("system");
    stop();
  });
});
