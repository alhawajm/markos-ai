import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";

const state = vi.hoisted(() => ({ enabled: true, available: vi.fn(), download: vi.fn(), reload: vi.fn(), alert: vi.fn(), pending: false }));
vi.mock("expo-updates", () => ({
  get isEnabled() {
    return state.enabled;
  },
  runtimeVersion: "0.3.0",
  createdAt: null,
  updateId: "test-update",
  isEmergencyLaunch: false,
  checkForUpdateAsync: state.available,
  fetchUpdateAsync: state.download,
  reloadAsync: state.reload,
  useUpdates: () => ({ isUpdatePending: state.pending, isChecking: false, isDownloading: false })
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert }, AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("../src/providers", () => ({ useAppearance: () => ({ locale: "en", t: (en: string) => en }) }));
vi.mock("../src/ui", async () => {
  const { createElement } = await import("react");
  return Object.fromEntries(
    ["Button", "Card", "Notice", "Txt"].map((name) => [name, (props: Record<string, unknown>) => createElement(name, props, props.children as React.ReactNode)])
  );
});
import { AppUpdateCard, checkAppUpdate } from "../src/app-updates";

let root: Root | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.enabled = true;
  state.pending = false;
  state.available.mockReset().mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: false });
  state.download.mockReset().mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });
  state.reload.mockReset().mockResolvedValue(undefined);
  state.alert.mockReset();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
});

describe("installed app update delivery", () => {
  it("does not fetch or reload when no compatible update exists", async () => {
    expect(await checkAppUpdate(true)).toBe(false);
    expect(state.download).not.toHaveBeenCalled();
    expect(state.reload).not.toHaveBeenCalled();
  });
  it("deduplicates simultaneous checks and downloads without restarting work", async () => {
    let finish!: (value: object) => void;
    state.available.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = checkAppUpdate(true),
      second = checkAppUpdate(true);
    finish({ isAvailable: true, isRollBackToEmbedded: false });
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(state.available).toHaveBeenCalledOnce();
    expect(state.download).toHaveBeenCalledOnce();
    expect(state.reload).not.toHaveBeenCalled();
  });
  it("throttles automatic foreground checks while allowing an explicit retry", async () => {
    await checkAppUpdate(true);
    await checkAppUpdate();
    await checkAppUpdate();
    expect(state.available).toHaveBeenCalledOnce();
    await checkAppUpdate(true);
    expect(state.available).toHaveBeenCalledTimes(2);
  });
  it("permits recovery after a failed download and skips disabled development runtimes", async () => {
    state.available.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    state.download.mockRejectedValueOnce(new Error("network"));
    await expect(checkAppUpdate(true)).rejects.toThrow("network");
    expect(await checkAppUpdate(true)).toBe(true);
    state.enabled = false;
    expect(await checkAppUpdate(true)).toBe(false);
    expect(state.available).toHaveBeenCalledTimes(2);
  });
  it("only restarts a downloaded update after the owner taps Restart", async () => {
    state.pending = true;
    root = createRoot();
    await act(async () => {
      root!.render(<AppUpdateCard />);
    });
    expect(state.reload).not.toHaveBeenCalled();
    const button = root.container.queryAll((node) => node.type === "Button" && node.props.label === "Restart to apply update")[0]!;
    await act(async () => {
      button.props.onPress();
    });
    expect(state.reload).not.toHaveBeenCalled();
    const confirm = state.alert.mock.calls[0]![2].find((entry: { text: string }) => entry.text === "Restart");
    await act(async () => {
      confirm.onPress();
    });
    expect(state.reload).toHaveBeenCalledOnce();
  });
});
