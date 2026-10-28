import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";

const state = vi.hoisted(() => ({ report: vi.fn(), epoch: vi.fn(), scope: "workspace-a", rtl: false }));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  return {
    ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "Pressable", "ScrollView", "Text", "TextInput", "View"].map((name) => [name, name])),
    Platform: { OS: "android" },
    Modal: (props: { visible: boolean; children: React.ReactNode }) => (props.visible ? createElement("Modal", props, props.children) : null)
  };
});
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, bottom: 24 }) }));
vi.mock("lucide-react-native", () => Object.fromEntries(["ArrowLeft", "Bell", "Check", "ChevronDown", "ChevronRight", "X"].map((name) => [name, () => null])));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("../src/providers", () => ({
  useSession: () => ({}),
  useAccount: () => ({ api: { reportContent: state.report }, scope: state.scope, epoch: 1 }),
  useAppearance: () => ({ colors: {}, rtl: state.rtl, t: (en: string, ar: string) => (state.rtl ? ar : en) })
}));
vi.mock("../src/auth/transport", () => ({ sessionController: { assertEpoch: state.epoch } }));
import { ContentReportSheet } from "../src/content-report";
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.report.mockReset();
  state.epoch.mockReset();
  state.scope = "workspace-a";
  state.rtl = false;
  root = createRoot();
});
afterEach(async () => {
  await act(async () => root.unmount());
});
const button = (label: string) => root.container.queryAll((n) => n.type === "Pressable" && n.props.accessibilityLabel === label)[0]!;
const input = () => root.container.queryAll((n) => n.type === "TextInput")[0]!;
const content = () =>
  root.container
    .queryAll((n) => n.type === "Text")
    .map((n) => n.props.children)
    .flat()
    .join(" ");
async function render(source: "CONTENT" | "GENERAL_AI" = "CONTENT") {
  await act(async () =>
    root.render(<ContentReportSheet visible onClose={() => {}} source={source} {...(source === "CONTENT" ? { sourceId: "post-id" } : {})} />)
  );
}
it("keeps an unsuccessful explanation and retries with the same request identity", async () => {
  state.report.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: "receipt-1", status: "OPEN" });
  await render();
  await act(async () => input().props.onChangeText("This is harmful content."));
  await act(async () => button("Send report").props.onPress());
  expect(input().props.value).toBe("This is harmful content.");
  expect(content()).not.toContain("Report received.");
  await act(async () => button("Send report").props.onPress());
  expect(state.report.mock.calls[0]?.[0]).toEqual(state.report.mock.calls[1]?.[0]);
  expect(state.report.mock.calls[0]?.[0]).toMatchObject({ source: "CONTENT", sourceId: "post-id", reason: "OFFENSIVE", note: "This is harmful content." });
  expect(content()).toContain("receipt-1");
  expect(state.epoch).toHaveBeenCalledWith(1);
});
it("uses a fresh identity after editing a failed report and resets across workspaces", async () => {
  state.report.mockRejectedValue(new Error("offline"));
  await render();
  await act(async () => button("Send report").props.onPress());
  await act(async () => input().props.onChangeText("Changed explanation"));
  await act(async () => button("Send report").props.onPress());
  expect(state.report.mock.calls[0]?.[0].requestId).not.toBe(state.report.mock.calls[1]?.[0].requestId);
  state.scope = "workspace-b";
  await render();
  expect(input().props.value).toBe("");
});
it("requires context for a general report and provides Arabic controls", async () => {
  state.rtl = true;
  await render("GENERAL_AI");
  expect(button("إرسال البلاغ").props.disabled).toBe(true);
  await act(async () => input().props.onChangeText("تفاصيل المشكلة في المحتوى"));
  expect(button("إرسال البلاغ").props.disabled).toBe(false);
  expect(content()).toContain("السبب");
});
it("prevents duplicate submissions and does not claim success after a workspace change", async () => {
  let resolve!: (value: { id: string }) => void;
  state.report.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await render();
  await act(async () => {
    button("Send report").props.onPress();
    button("Send report").props.onPress();
  });
  expect(state.report).toHaveBeenCalledTimes(1);
  expect(button("Send report").props.disabled).toBe(true);
  state.scope = "workspace-b";
  await render();
  await act(async () => resolve({ id: "old-receipt" }));
  expect(content()).not.toContain("old-receipt");
});
