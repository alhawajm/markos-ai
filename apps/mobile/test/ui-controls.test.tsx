import React, { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";

const appearance = vi.hoisted(() => ({ rtl: false }));
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
  useAppearance: () => ({ rtl: appearance.rtl, colors: {}, t: (en: string, ar: string) => (appearance.rtl ? ar : en) })
}));

import { Disclosure, Field, Row, Segmented, SelectField, Sheet } from "../src/ui";

let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  appearance.rtl = false;
  root = createRoot();
});
afterEach(async () => {
  await act(async () => root.unmount());
});
const press = async (label: string) => {
  const button = root.container.queryAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === label)[0];
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
  });
};

describe("focused mobile panels", () => {
  it("keeps an unfinished field mounted and inaccessible while its section is collapsed", async () => {
    function Form() {
      const [text, setText] = useState("");
      return (
        <Disclosure title="Text overlays">
          <Field label="Exact text" value={text} onChangeText={setText} />
        </Disclosure>
      );
    }
    await act(async () => root.render(<Form />));
    const hidden = () => root.container.queryAll((node) => node.type === "View" && node.props.importantForAccessibility === "no-hide-descendants");
    expect(hidden()).toHaveLength(1);
    await press("Text overlays");
    const input = () => root.container.queryAll((node) => node.type === "TextInput")[0]!;
    await act(async () => input().props.onChangeText("Blooms in Pink\nبلومز باللون الوردي"));
    await press("Text overlays");
    expect(hidden()).toHaveLength(1);
    expect(input().props.value).toContain("بلومز");
    await press("Text overlays");
    expect(hidden()).toHaveLength(0);
    expect(input().props.value).toContain("Blooms in Pink");
  });

  it("dismisses through Android Back or the close control without clearing the parent draft", async () => {
    function Form() {
      const [open, setOpen] = useState(true);
      const [text, setText] = useState("Keep this draft");
      return (
        <>
          <Field label="Caption" value={text} onChangeText={setText} />
          <Sheet title="Options" visible={open} onClose={() => setOpen(false)}>
            <Row />
          </Sheet>
        </>
      );
    }
    await act(async () => root.render(<Form />));
    const modal = root.container.queryAll((node) => node.type === "Modal")[0]!;
    await act(async () => modal.props.onRequestClose());
    expect(root.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
    expect(root.container.queryAll((node) => node.type === "TextInput")[0]!.props.value).toBe("Keep this draft");
    await act(async () => root.render(<Form key="reopen" />));
    await press("Close");
    expect(root.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
  });

  it("exposes the current section and disabled state without making every tab a primary button", async () => {
    const change = vi.fn();
    await act(async () =>
      root.render(
        <Segmented
          value="media"
          disabled
          options={[
            { value: "caption", label: "Caption" },
            { value: "media", label: "Media" }
          ]}
          onChange={change}
        />
      )
    );
    const tabs = root.container.queryAll((node) => node.type === "Pressable");
    expect(tabs.map((node) => node.props.accessibilityState)).toEqual([
      { selected: false, disabled: true },
      { selected: true, disabled: true }
    ]);
    expect(tabs.every((node) => node.props.disabled)).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });

  it("mirrors shared rows once for Arabic", async () => {
    appearance.rtl = true;
    await act(async () => root.render(<Row />));
    expect(root.container.queryAll((node) => node.type === "View")[0]!.props.style[0].flexDirection).toBe("row-reverse");
  });

  it("changes a compact selection and closes its panel without resetting unfinished form fields", async () => {
    function Form() {
      const [priceType, setPriceType] = useState("FIXED");
      const [text, setText] = useState("12.500");
      return (
        <>
          <Field label="Price" value={text} onChangeText={setText} />
          <SelectField
            label="Pricing"
            value={priceType}
            options={[
              { value: "FIXED", label: "Fixed price" },
              { value: "RANGE", label: "Price range" }
            ]}
            onChange={setPriceType}
          />
        </>
      );
    }
    await act(async () => root.render(<Form />));
    expect(root.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
    await press("Fixed price");
    const selected = root.container.queryAll(
      (node) => node.type === "Pressable" && node.props.accessibilityLabel === "Fixed price" && node.props.accessibilityState.selected === true
    );
    expect(selected).toHaveLength(1);
    await press("Price range");
    expect(root.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
    expect(root.container.queryAll((node) => node.type === "TextInput")[0]!.props.value).toBe("12.500");
    await press("Price range");
    await press("Close");
    expect(root.container.queryAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === "Price range")).toHaveLength(1);
  });
});
