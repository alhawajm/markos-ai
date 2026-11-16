import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("react-native", () => ({ View: "View", TextInput: "TextInput", Pressable: "Pressable" }));
vi.mock("lucide-react-native", () => ({ Send: () => null, RotateCcw: () => null }));
vi.mock("../src/motion", () => ({ InkPulse: "InkPulse" }));
vi.mock("../src/providers", () => ({
  useAppearance: () => ({
    locale: state.locale,
    t: (en: string, ar: string) => (state.locale === "ar" ? ar : en),
    colors: {
      text: "#263640",
      surface: "#fff",
      muted: "#666",
      borderStrong: "#999",
      focus: "#19696b",
      surfaceMuted: "#eee",
      primary: "#e7b7c8",
      onPrimary: "#263640"
    }
  })
}));
import { ChatComposer } from "../src/chat-composer";
let root: Root;
afterEach(async () => {
  await act(() => root.unmount());
});
async function render(props: Partial<React.ComponentProps<typeof ChatComposer>> = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await act(() => root.render(<ChatComposer value="" onChange={() => {}} onSend={() => {}} {...props} />));
}
it.each(["en", "ar"])("keeps one accessible input and an inline send control (%s)", async (locale) => {
  root = createRoot();
  state.locale = locale;
  const change = vi.fn(),
    send = vi.fn();
  await render({ value: "Hello", onChange: change, onSend: send });
  const field = root.container.queryAll((n) => n.type === "TextInput")[0]!,
    button = root.container.queryAll((n) => n.type === "Pressable")[0]!;
  expect(root.container.queryAll((n) => n.type === "TextInput")).toHaveLength(1);
  expect(field.props.accessibilityLabel).toBe(locale === "ar" ? "راسل ماركوس" : "Message MARKOS");
  expect(field.props.style.height).toBe(44);
  expect(button.props.accessibilityLabel).toBe(locale === "ar" ? "إرسال" : "Send");
  expect(field.props.style.textAlign).toBe(locale === "ar" ? "right" : "left");
  await act(() => field.props.onChangeText("A new idea"));
  expect(change).toHaveBeenCalledWith("A new idea");
  await act(() => button.props.onPress());
  expect(send).toHaveBeenCalledOnce();
});
it("grows for a longer message, stays bounded and collapses after sending", async () => {
  root = createRoot();
  state.locale = "en";
  await render({ value: "A long message" });
  const field = () => root.container.queryAll((n) => n.type === "TextInput")[0]!;
  await act(() => field().props.onContentSizeChange({ nativeEvent: { contentSize: { height: 92 } } }));
  expect(field().props.style.height).toBe(92);
  await act(() => field().props.onContentSizeChange({ nativeEvent: { contentSize: { height: 2000 } } }));
  expect(field().props.style.height).toBe(136);
  expect(field().props.scrollEnabled).toBe(true);
  await render({ value: "" });
  expect(field().props.style.height).toBe(44);
  expect(field().props.scrollEnabled).toBe(false);
});
it("blocks duplicate sends while working and exposes a saved-request retry", async () => {
  root = createRoot();
  state.locale = "en";
  const send = vi.fn();
  await render({ value: "Saved message", onSend: send, busy: true });
  let button = root.container.queryAll((n) => n.type === "Pressable")[0]!;
  expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
  await act(() => button.props.onPress());
  expect(send).not.toHaveBeenCalled();
  await render({ value: "Saved message", onSend: send, retry: true, editable: false });
  button = root.container.queryAll((n) => n.type === "Pressable")[0]!;
  expect(button.props.accessibilityLabel).toBe("Retry saved message");
  expect(root.container.queryAll((n) => n.type === "TextInput")[0]!.props.editable).toBe(false);
  await act(() => button.props.onPress());
  expect(send).toHaveBeenCalledOnce();
});
