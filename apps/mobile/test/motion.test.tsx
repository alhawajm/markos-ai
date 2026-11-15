import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";

const state = vi.hoisted(() => ({
  reduced: true,
  rtl: false,
  preference: null as null | ((value: boolean) => void),
  app: null as null | ((value: string) => void),
  start: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn()
}));
vi.mock("react-native", () => ({
  Text: "Text",
  View: "View",
  Easing: { linear: () => 0 },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => state.reduced,
    addEventListener: (_name: string, fn: (value: boolean) => void) => {
      state.preference = fn;
      return { remove: state.remove };
    }
  },
  AppState: {
    currentState: "active",
    addEventListener: (_name: string, fn: (value: string) => void) => {
      state.app = fn;
      return { remove: state.remove };
    }
  },
  Animated: {
    View: "AnimatedView",
    Value: class {
      setValue = vi.fn();
      interpolate = () => 0;
      stopAnimation = vi.fn();
    },
    timing: () => ({ start: state.start, stop: state.stop }),
    loop: () => ({ start: state.start, stop: state.stop })
  }
}));
vi.mock("../src/providers", () => ({
  useAppearance: () => ({
    rtl: state.rtl,
    colors: { text: "#263640", textSoft: "#52616b", surface: "#fff", border: "#ddd", accentText: "#176c70" },
    t: (en: string, ar: string) => (state.rtl ? ar : en)
  })
}));
import { InkPulse, TaskFeedback } from "../src/motion";
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.reduced = true;
  state.rtl = false;
  vi.clearAllMocks();
  root = createRoot();
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it("keeps waiting feedback readable without animation when Reduce Motion is on", async () => {
  await act(async () => root.render(<TaskFeedback label="Planning your campaign" progress={{ completedWeeks: 1, totalWeeks: 5 }} />));
  expect(state.start).not.toHaveBeenCalled();
  const bar = root.container.queryAll((n) => n.props.accessibilityRole === "progressbar")[0]!;
  expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 1 });
  expect(root.container.queryAll((n) => n.type === "Text" && n.props.children === "Planning your campaign")).toHaveLength(1);
});
it("stops the activity loop on backgrounding and when Reduce Motion is enabled", async () => {
  state.reduced = false;
  await act(async () => root.render(<InkPulse />));
  expect(state.start).toHaveBeenCalledOnce();
  await act(async () => state.app!("background"));
  expect(state.stop).toHaveBeenCalled();
  await act(async () => state.app!("active"));
  expect(state.start).toHaveBeenCalledTimes(2);
  await act(async () => state.preference!(true));
  expect(state.stop).toHaveBeenCalledTimes(2);
});
it("uses actual saved-week progress and Arabic copy without claiming completion", async () => {
  state.rtl = true;
  await act(async () => root.render(<TaskFeedback label="أُعدّ حملتك" progress={{ completedWeeks: 1, totalWeeks: 5 }} />));
  const texts = root.container
    .queryAll((n) => n.type === "Text")
    .map((n) => n.props.children)
    .join(" ");
  expect(texts).toContain("تم حفظ 1 من 5 أسابيع");
  expect(texts).not.toContain("100%");
  expect(state.start).not.toHaveBeenCalled();
});
