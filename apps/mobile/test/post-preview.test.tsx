import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
import type { ContentRecord, MediaAssetRecord } from "@markos/shared-types";
const state = vi.hoisted(() => ({ locale: "en" }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("lucide-react-native", () => ({ ChevronLeft: () => null, ChevronRight: () => null }));
vi.mock("../src/providers", () => ({ useAppearance: () => ({ colors: {}, t: (en: string, ar: string) => (state.locale === "ar" ? ar : en) }) }));
vi.mock("../src/ui", () =>
  Object.fromEntries(
    ["IconButton", "Row", "TextAction", "Txt"].map((tag) => [
      tag,
      (props: Record<string, unknown>) => React.createElement(tag, props, props.children as React.ReactNode)
    ])
  )
);
vi.mock("../src/studio/media-preview", () => ({ MediaPreview: "MediaPreview" }));
import { PostPreview } from "../src/studio/post-preview";
const assets = [
  { id: "first", filename: "one.jpg" },
  { id: "second", filename: "two.jpg" }
] as MediaAssetRecord[];
const item = {
  id: "draft",
  contentType: "CAROUSEL",
  caption: "A long bilingual caption. نص طويل باللغتين. ".repeat(10),
  mediaItems: [
    { id: "slide-two", position: 1, mediaAssetId: "second" },
    { id: "slide-one", position: 0, mediaAssetId: "first" }
  ]
} as ContentRecord;
let root: Root;
afterEach(async () => {
  await act(() => root?.unmount());
});
it.each(["en", "ar"])("shows one ordered carousel slide and expands its caption without decorative controls (%s)", async (locale) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.locale = locale;
  root = createRoot();
  await act(() => root.render(<PostPreview item={item} assets={assets} />));
  const preview = () => root.container.queryAll((n) => n.type === "MediaPreview");
  expect(preview()).toHaveLength(1);
  expect(preview()[0]!.props).toMatchObject({ asset: assets[0], canvas: true, gallery: assets });
  const next = root.container.queryAll((n) => n.type === "IconButton" && n.props.label === (locale === "ar" ? "الشريحة التالية" : "Next slide"))[0]!;
  await act(() => next.props.onPress());
  expect(preview()[0]!.props.asset).toBe(assets[1]);
  const caption = () => root.container.queryAll((n) => n.type === "Txt" && n.props.children === item.caption)[0]!;
  expect(caption().props.numberOfLines).toBe(4);
  await act(() => root.container.queryAll((n) => n.type === "TextAction")[0]!.props.onPress());
  expect(caption().props.numberOfLines).toBeUndefined();
  expect(root.container.queryAll((n) => n.type === "IconButton")).toHaveLength(2);
});
it("keeps Story supporting text out of the publication preview", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.locale = "en";
  root = createRoot();
  await act(() => root.render(<PostPreview item={{ ...item, contentType: "STORY", mediaItems: [item.mediaItems[1]!] }} assets={assets} />));
  expect(root.container.queryAll((n) => n.type === "Txt" && n.props.children === item.caption)).toHaveLength(0);
  expect(root.container.queryAll((n) => n.type === "IconButton")).toHaveLength(0);
});
