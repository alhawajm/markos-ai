import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
import type { MediaAssetRecord } from "@markos/shared-types";
const state = vi.hoisted(() => ({
  pause: vi.fn(),
  replaceAsync: vi.fn().mockResolvedValue(undefined),
  status: "readyToPlay",
  background: null as null | ((value: string) => void)
}));
vi.mock("react-native", () => ({
  View: "View",
  Image: "Image",
  Pressable: "Pressable",
  Modal: "Modal",
  ScrollView: "ScrollView",
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  AppState: {
    addEventListener: (_event: string, cb: (value: string) => void) => {
      state.background = cb;
      return { remove: vi.fn() };
    }
  }
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("lucide-react-native", () => Object.fromEntries(["ChevronLeft", "ChevronRight", "X", "ZoomIn", "ZoomOut"].map((key) => [key, () => null])));
vi.mock("expo-router", () => ({ useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, []) }));
vi.mock("expo", () => ({ useEvent: () => ({ status: state.status }) }));
vi.mock("expo-video", () => ({ useVideoPlayer: () => ({ pause: state.pause, replaceAsync: state.replaceAsync }), VideoView: "VideoView" }));
vi.mock("../src/providers", () => ({ useAppearance: () => ({ colors: {}, t: (en: string) => en }) }));
vi.mock("../src/ui", () =>
  Object.fromEntries(
    ["Button", "IconButton", "Notice", "Row", "Txt"].map((tag) => [
      tag,
      (props: Record<string, unknown>) => React.createElement(tag, props, props.children as React.ReactNode)
    ])
  )
);
import { MediaPreview } from "../src/studio/media-preview";
const asset = (id: string, mimeType = "image/jpeg") =>
  ({ id, filename: `${id}.jpg`, mimeType, publicUrl: `https://media.example/${id}`, width: 1080, height: 1350 }) as MediaAssetRecord;
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
  vi.clearAllMocks();
  state.status = "readyToPlay";
});
it("opens images, zooms, navigates the gallery and closes without changing a draft", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot();
  await act(() => root.render(<MediaPreview asset={asset("first")} gallery={[asset("first"), asset("second")]} />));
  await act(() => root.container.queryAll((n) => n.type === "Pressable")[0]!.props.onPress());
  expect(root.container.queryAll((n) => n.type === "Modal")).toHaveLength(1);
  const button = (label: string) => root.container.queryAll((n) => n.type === "IconButton" && n.props.label === label)[0]!;
  const width = () => root.container.queryAll((n) => n.type === "Image").at(-1)!.props.style.width;
  const fit = width();
  await act(() => button("Zoom in").props.onPress());
  expect(width()).toBe(fit * 2);
  await act(() => button("Next media").props.onPress());
  expect(root.container.queryAll((n) => n.type === "Image").at(-1)!.props.source.uri).toBe("https://media.example/second");
  await act(() => root.container.queryAll((n) => n.type === "Modal")[0]!.props.onRequestClose());
  expect(root.container.queryAll((n) => n.type === "Modal")).toHaveLength(0);
});
it("opens a full Reel with playback controls, pauses the small preview, and handles load failure", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot();
  state.status = "error";
  await act(() => root.render(<MediaPreview asset={asset("reel", "video/mp4")} />));
  await act(() => root.container.queryAll((n) => n.type === "Button" && n.props.label === "Open full-size Reel")[0]!.props.onPress());
  expect(state.pause).toHaveBeenCalled();
  expect(root.container.queryAll((n) => n.type === "VideoView").at(-1)!.props).toMatchObject({ nativeControls: true, contentFit: "contain" });
  await act(() =>
    root.container
      .queryAll((n) => n.type === "Button" && n.props.label === "Reload Reel")
      .at(-1)!
      .props.onPress()
  );
  expect(state.replaceAsync).toHaveBeenCalledWith("https://media.example/reel");
  state.background?.("background");
  expect(state.pause.mock.calls.length).toBeGreaterThan(1);
});
