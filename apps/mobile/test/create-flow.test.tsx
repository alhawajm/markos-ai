import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MarkosApiClient } from "@markos/api-client";
import type { ContentRecord, ContentConversationRecord, MediaAssetRecord, CampaignReviewRecord, MediaGenerationJobRecord } from "@markos/shared-types";
import { fixture } from "./fixtures/studio";

const state = vi.hoisted(() => ({
  api: {} as MarkosApiClient,
  client: null as QueryClient | null,
  locale: "en",
  alert: vi.fn(),
  push: vi.fn(),
  replace: vi.fn()
}));
vi.mock("react-native", () => ({
  View: "View",
  Image: "Image",
  ScrollView: "ScrollView",
  RefreshControl: "RefreshControl",
  Pressable: "Pressable",
  Platform: { OS: "ios" },
  Alert: { alert: state.alert }
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "Save",
      "Check",
      "Eye",
      "MessageCircle",
      "CalendarDays",
      "ArrowUp",
      "ArrowDown",
      "FolderOpen",
      "Plus",
      "Sparkles",
      "Trash2",
      "Upload",
      "Clapperboard",
      "Images",
      "Palette",
      "Heart",
      "Send",
      "Bookmark",
      "FileText",
      "Share2"
    ].map((name) => [name, () => null])
  )
);
vi.mock("expo-router", () => ({ useRouter: () => ({ push: state.push, replace: state.replace }), useLocalSearchParams: () => ({ id: "content" }) }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => true, useNavigation: () => ({ dispatch: vi.fn() }), usePreventRemove: vi.fn() }));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "DateTimePicker" }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("../src/share-file", () => ({ shareFile: vi.fn() }));
vi.mock("../src/studio/media-preview", () => ({ MediaPreview: "MediaPreview" }));
vi.mock("../src/studio/motion-reel", () => ({ MotionReel: "MotionReel" }));
vi.mock("../src/auth/transport", () => ({ sessionController: { assertEpoch: vi.fn() } }));
vi.mock("../src/studio/device-store", () => ({
  StudioDeviceStore: class {
    readEditor = async () => null;
    saveEditor = async () => {};
    clearEditor = async () => {};
    readMessage = async () => ({ text: "", pending: null });
    saveMessage = async () => {};
    startMessage = async () => {};
    finishMessage = async () => true;
  },
  restoreEditor: vi.fn()
}));
vi.mock("../src/providers", () => ({
  useAccount: () => ({ api: state.api, scope: "test", epoch: 1, queryClient: state.client, session: { workspace: { id: "workspace" } } }),
  useAppearance: () => ({
    locale: state.locale,
    rtl: state.locale === "ar",
    t: (en: string, ar: string) => (state.locale === "ar" ? ar : en),
    colors: {},
    mode: "light"
  })
}));
vi.mock("../src/ui", async () => {
  const { createElement } = await import("react");
  return Object.fromEntries(
    ["Button", "Card", "Field", "IconButton", "Loading", "Notice", "Row", "Screen", "Txt"].map((name) => [
      name,
      (props: Record<string, unknown>) => createElement(name, props, props.children as React.ReactNode, props.footer as React.ReactNode)
    ])
  );
});

import ContentDraft from "../app/content/[id]";
import CampaignReview from "../app/campaign/[id]";
import { typeLabel } from "../src/content";

let root: Root;
let item: ContentRecord;
let assets: MediaAssetRecord[];
let thread: ContentConversationRecord;
const photo: MediaAssetRecord = {
  id: "photo",
  workspaceId: "workspace",
  type: "IMAGE",
  filename: "photo.jpg",
  publicUrl: "https://example.test/photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1000,
  createdAt: fixture.createdAt,
  updatedAt: fixture.updatedAt
};
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function mount(element = <ContentDraft />) {
  await act(async () => {
    root.render(<QueryClientProvider client={state.client!}>{element}</QueryClientProvider>);
  });
  await settle();
  await settle();
}
function buttons(label: string) {
  return root.container.queryAll((node) => node.type === "Button" && node.props.label === label);
}
async function press(label: string) {
  const button = buttons(label)[0];
  expect(
    button,
    `Missing button ${label}: ${JSON.stringify(root.container.queryAll((node) => node.type === "Button").map((node) => node.props.label))}; saved=${JSON.stringify(item)}`
  ).toBeDefined();
  expect(button!.props.disabled).not.toBe(true);
  await act(async () => {
    button!.props.onPress();
  });
  await settle();
  await settle();
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.locale = "en";
  state.alert.mockReset();
  state.push.mockReset();
  state.replace.mockReset();
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  root = createRoot();
  item = structuredClone(fixture);
  assets = [];
  thread = { id: "thread", contentItem: item, messages: [], latestRun: null };
  const api = {
    contentItem: vi.fn(async () => item),
    mediaAssets: vi.fn(async () => assets),
    videoCapabilities: vi.fn(async () => ({ motion: true, generatedFootage: false })),
    latestMediaGenerationJob: vi.fn(async () => null),
    contentConversation: vi.fn(async () => ({ ...thread, contentItem: item })),
    mutateContent: vi.fn(async (_id, input) => {
      expect(input.expectedRevision).toBe(item.revision);
      for (const op of input.operations) {
        if (op.type === "updateContent") item = { ...item, ...op.fields } as ContentRecord;
        if (op.type === "updateMediaItem")
          item = { ...item, mediaItems: item.mediaItems.map((media) => (media.id === op.itemId ? { ...media, ...op.fields } : media)) };
      }
      item = { ...item, revision: item.revision + 1, updatedAt: new Date().toISOString() };
      return item;
    }),
    generateContentImage: vi.fn(async (_id, input) => {
      expect(input.expectedRevision).toBe(item.revision);
      expect(item.mediaItems.find((media) => media.id === input.contentMediaItemId)?.mediaKind).toBe("IMAGE");
      assets = [photo];
      item = {
        ...item,
        revision: item.revision + 1,
        updatedAt: new Date().toISOString(),
        mediaItems: item.mediaItems.map((media) => (media.id === input.contentMediaItemId ? { ...media, mediaAssetId: photo.id } : media))
      };
      return {} as never;
    }),
    updateContentStatus: vi.fn(async (_id, status, revision) => {
      expect(revision).toBe(item.revision);
      expect(item.mediaItems.every((media) => media.mediaAssetId)).toBe(true);
      item = { ...item, status, revision: item.revision + 1, updatedAt: new Date().toISOString() };
      return item;
    }),
    sendConversationMessage: vi.fn(async (_id, input) => {
      expect(input.message).not.toContain("8-second Reel");
      item = { ...item, caption: "Assistant draft", revision: item.revision + 1, updatedAt: new Date().toISOString() };
      thread = {
        ...thread,
        contentItem: item,
        messages: [{ id: "message", runId: "run", role: "assistant", text: "Draft prepared", createdAt: fixture.createdAt }],
        latestRun: { id: "run", requestId: input.requestId, status: "SUCCEEDED", errorCode: null, proposedCaption: null }
      };
      return thread;
    })
  } satisfies Partial<MarkosApiClient>;
  state.api = api as unknown as MarkosApiClient;
});
afterEach(async () => {
  await act(async () => root.unmount());
  state.client?.clear();
});

describe("rendered native Create handoffs", () => {
  it("unlocks Ready when the queued video finishes and is attached", async () => {
    item = { ...item, contentType: "REEL", mediaItems: [{ ...item.mediaItems[0]!, mediaKind: "VIDEO" }] };
    let job: MediaGenerationJobRecord = {
      id: "job",
      workspaceId: "workspace",
      contentItemId: item.id,
      contentMediaItemId: "slot",
      requestedRevision: item.revision,
      kind: "VIDEO",
      status: "PROCESSING",
      prompt: "Motion",
      aspectRatio: "9:16",
      durationSeconds: 8,
      progress: 80,
      createdAt: fixture.createdAt,
      updatedAt: fixture.updatedAt
    };
    state.api.latestMediaGenerationJob = vi.fn(async () => job);
    await mount();
    expect(buttons("Generating…")[0]!.props.disabled).toBe(true);
    const video: MediaAssetRecord = { ...photo, id: "video", type: "VIDEO", filename: "video.mp4", mimeType: "video/mp4" };
    assets = [video];
    item = { ...item, revision: item.revision + 1, mediaItems: [{ ...item.mediaItems[0]!, mediaAssetId: video.id }] };
    job = { ...job, status: "COMPLETED", progress: 100, outputMediaAssetId: video.id, attachmentApplied: true };
    await act(async () => {
      state.client!.setQueryData(["test", "video-job", item.id], job);
      await state.client!.invalidateQueries({ queryKey: ["test", "content"] });
      await state.client!.invalidateQueries({ queryKey: ["test", "media"] });
    });
    await settle();
    await settle();
    expect(buttons("Mark ready")[0]!.props.disabled).toBe(false);
    expect(buttons("Generating…")).toHaveLength(0);
  });
  it("takes an Assistant Post draft through image generation, Ready and scheduling navigation", async () => {
    item = { ...item, caption: "" };
    await mount();
    expect(buttons("Mark ready")).toHaveLength(0);
    await press("Prepare caption");
    await press("Prepare this draft");
    await press("Generate or choose media");
    expect(root.container.queryAll((node) => node.type === "MotionReel")).toHaveLength(0);
    await press("Generate image");
    expect(state.api.generateContentImage).toHaveBeenCalledOnce();
    await press("Mark ready");
    const confirm = state.alert.mock.calls.at(-1)![2].find((button: { text: string }) => button.text === "Mark ready");
    await act(async () => {
      confirm.onPress();
    });
    await settle();
    await settle();
    expect(state.api.updateContentStatus).toHaveBeenCalledOnce();
    await press("Schedule");
    expect(state.push).toHaveBeenCalledWith({ pathname: "/content/schedule", params: { id: "content" } });
  });
  it("shows a Story as Story and allows image generation instead of forcing a Reel", async () => {
    item = { ...item, contentType: "STORY", caption: "", mediaItems: [{ ...item.mediaItems[0]!, mediaKind: null }] };
    await mount();
    expect(typeLabel("STORY", (en) => en)).toBe("Story");
    await press("Complete media");
    expect(buttons("Generate image")[0]!.props.disabled).toBe(true);
    await press("Image");
    await press("Generate image");
    expect(item.mediaItems[0]!.mediaKind).toBe("IMAGE");
    expect(buttons("Mark ready")[0]!.props.disabled).toBe(false);
    expect(root.container.queryAll((node) => node.type === "MotionReel")).toHaveLength(0);
  });
  it("locks approval while the Assistant is dispatching media", async () => {
    item = { ...item, mediaItems: [{ ...item.mediaItems[0]!, mediaAssetId: photo.id }] };
    assets = [photo];
    thread = { ...thread, latestRun: { id: "run", requestId: "request", status: "DISPATCHING", errorCode: null, proposedCaption: null } };
    await mount();
    expect(buttons("Generating…")[0]!.props.disabled).toBe(true);
    expect(buttons("Change content format")[0]!.props.disabled).toBe(true);
    expect(state.api.updateContentStatus).not.toHaveBeenCalled();
  });
  it("accepts a newer Assistant revision with the same timestamp and exposes generation recovery", async () => {
    item = { ...item, caption: "" };
    await mount();
    item = { ...item, caption: "New caption", revision: item.revision + 1 };
    await act(async () => {
      state.client!.setQueryData(["test", "content", item.id], item);
    });
    await settle();
    expect(buttons("Prepare caption")).toHaveLength(0);
    await press("Complete media");
    state.api.generateContentImage = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    await press("Generate image");
    expect(buttons("Mark ready")).toHaveLength(0);
    expect(buttons("Generate image")[0]!.props.disabled).toBe(false);
    expect(state.api.updateContentStatus).not.toHaveBeenCalled();
  });
  it("requires a reviewed conversion before detaching a Post image for a Reel", async () => {
    item = { ...item, mediaItems: [{ ...item.mediaItems[0]!, mediaAssetId: photo.id }] };
    assets = [photo];
    state.api.convertContent = vi.fn(async (_id, input) => {
      expect(input.expectedRevision).toBe(item.revision);
      const preview = {
        from: "POST" as const,
        to: "REEL" as const,
        requiresConfirmation: true,
        requiresSelection: false,
        retainedItemId: "slot",
        removedItemIds: [],
        detachedAssetIds: [photo.id],
        resetFields: []
      };
      if (!input.confirmDestructive) return { applied: false, content: item, preview };
      item = { ...item, contentType: "REEL", revision: item.revision + 1, mediaItems: [{ ...item.mediaItems[0]!, mediaKind: "VIDEO", mediaAssetId: null }] };
      return { applied: true, content: item, preview };
    });
    await mount();
    await press("Change content format");
    await press("Reel");
    expect(item.contentType).toBe("POST");
    await press("Confirm format change");
    await press("Complete media");
    expect(item.contentType).toBe("REEL");
    expect(root.container.queryAll((node) => node.type === "MotionReel")).toHaveLength(1);
    expect(buttons("Generate image")).toHaveLength(0);
    expect(buttons("Mark ready")).toHaveLength(0);
  });
  it("keeps Arabic Story controls and missing-media recovery accessible", async () => {
    state.locale = "ar";
    item = { ...item, contentType: "STORY", caption: "", mediaItems: [{ ...item.mediaItems[0]!, mediaKind: "IMAGE" }] };
    await mount();
    await press("إكمال الوسائط");
    expect(buttons("إنشاء صورة")).toHaveLength(1);
    expect(typeLabel("STORY", (_en, ar) => ar)).toBe("قصة");
    expect(buttons("اعتماد")).toHaveLength(0);
  });
  it("opens the correct campaign idea after filtering by Story format", async () => {
    const post = { title: "Post idea", description: "Event context", contentType: "POST", goal: "Awareness", contentPillar: "Trust" };
    const data = {
      campaign: {
        id: "campaign",
        title: "Blooms",
        status: "DRAFT",
        startsAt: fixture.createdAt,
        durationDays: 3,
        publishesPerDay: 1,
        content: {
          summary: "Summary",
          objectives: [],
          pillars: [],
          risks: [],
          kpis: [],
          nextActions: [],
          weeklyCadence: [
            {
              week: 1,
              focus: "Event",
              days: [
                { day: 1, posts: [post] },
                { day: 2, posts: [{ ...post, contentType: "STORY", title: "Story idea" }] }
              ]
            }
          ]
        }
      },
      items: [],
      mediaAssets: []
    } as unknown as CampaignReviewRecord;
    state.api.campaignReview = vi.fn(async () => data);
    state.api.approveCampaignSuggestion = vi.fn(async () => item);
    await mount(<CampaignReview />);
    await press("Story");
    await press("Prepare draft");
    expect(state.api.approveCampaignSuggestion).toHaveBeenCalledWith("content", { week: 1, actionIndex: 1 });
    expect(state.push).toHaveBeenCalledWith({ pathname: "/content/[id]", params: { id: "content" } });
  });
});
