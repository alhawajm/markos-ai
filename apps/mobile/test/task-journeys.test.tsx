import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaskIntent } from "@markos/shared-types";
const state = vi.hoisted(() => ({
  scope: "owner:workspace",
  locale: "en",
  client: null as QueryClient | null,
  api: {
    workspaceAssistant: vi.fn(),
    assistantChats: vi.fn(),
    assistantChatMessages: vi.fn(),
    renameAssistantChat: vi.fn(),
    messageWorkspaceAssistant: vi.fn(),
    confirmWorkspaceAssistant: vi.fn(),
    createContent: vi.fn()
  },
  push: vi.fn(),
  stores: new Map<string, unknown>()
}));
vi.mock("react-native", () => ({ View: "View", RefreshControl: "RefreshControl", ScrollView: "ScrollView", TextInput: "TextInput", Pressable: "Pressable" }));
vi.mock("lucide-react-native", () => ({
  Send: () => null,
  Ellipsis: () => null,
  RotateCcw: () => null,
  MessagesSquare: () => null,
  SquarePen: () => null,
  ArrowUpRight: () => null
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => true }));
vi.mock("../src/providers", () => ({
  useAccount: () => ({
    api: state.api,
    scope: state.scope,
    epoch: 1,
    queryClient: state.client,
    session: { roles: ["OWNER"], workspace: { id: "workspace" }, user: { id: "owner" } }
  }),
  useAppearance: () => ({ locale: state.locale, colors: {}, t: (en: string, ar: string) => (state.locale === "ar" ? ar : en) })
}));
vi.mock("../src/business/device-store", () => ({
  BusinessDeviceStore: class {
    key: string;
    constructor(scope: string, _epoch: number, kind: string, partition?: string) {
      this.key = `${scope}:${kind}${partition ? `:chat:${partition}` : ""}`;
    }
    read = async () => state.stores.get(this.key) ?? null;
    save = async (value: unknown) => {
      state.stores.set(this.key, value);
    };
    clear = async () => {
      state.stores.delete(this.key);
    };
  }
}));
vi.mock("../src/auth/transport", () => ({ sessionController: { assertEpoch: vi.fn() } }));
vi.mock("../src/errors", () => ({ errorMessage: () => "Try again" }));
vi.mock("../src/content-report", () => ({ ContentReportSheet: () => null }));
vi.mock("../src/personal-memory", () => ({ PersonalMemorySheet: () => null }));
vi.mock("../src/motion", async () => {
  const { createElement } = await import("react");
  return {
    MarkosMark: () => null,
    InkPulse: () => null,
    TaskFeedback: ({ label }: { label: string }) => createElement("TaskFeedback", {}, label),
    Enter: ({ children }: React.PropsWithChildren) => children
  };
});
vi.mock("../src/ui", async () => {
  const { createElement } = await import("react");
  return Object.fromEntries(
    ["Button", "Card", "Disclosure", "Field", "Loading", "Notice", "Screen", "Txt", "TextAction", "Row", "IconButton", "Sheet", "ListRow"].map((tag) => [
      tag,
      (props: Record<string, unknown>) => createElement(tag, props, props.children as React.ReactNode, props.footer as React.ReactNode)
    ])
  );
});
import { WorkspaceAssistantScreen } from "../src/workspace-assistant";
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  state.client?.clear();
});
it.each(["CONTENT", "CAMPAIGN", "STRATEGY"] as TaskIntent[])("takes a goal through one confirmation in native %s", async (intent) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  state.scope = "owner:workspace";
  state.stores.clear();
  state.locale = intent === "CAMPAIGN" ? "ar" : "en";
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.api.workspaceAssistant.mockResolvedValue([]);
  const turn = {
    id: "task",
    intent,
    message: "Attract more bakery customers",
    reply: "A useful direction",
    status: "PROPOSED",
    createdAt: new Date().toISOString(),
    confirmationToken: "confirm",
    proposal: {
      action: intent,
      summary: "A focused plan",
      instruction: "Create a focused bakery plan",
      contentType: "POST",
      contentItemId: null,
      durationDays: 7
    }
  };
  state.api.messageWorkspaceAssistant.mockResolvedValue(turn);
  state.api.confirmWorkspaceAssistant.mockResolvedValue({
    ...turn,
    status: "COMPLETED",
    ...(intent === "CONTENT"
      ? { contentItemId: "draft" }
      : intent === "CAMPAIGN"
        ? { campaignId: "campaign" }
        : {
            strategy: {
              summary: "Our direction",
              strategy: { objectives: [], pillars: ["Local baking"], nextActions: ["Prepare next week"] },
              sources: ["PRIVATE/technical-source"]
            }
          })
  });
  root = createRoot();
  await act(async () => {
    root!.render(
      <QueryClientProvider client={state.client!}>
        <WorkspaceAssistantScreen embedded intent={intent} />
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(state.api.createContent).not.toHaveBeenCalled();
  expect(state.api.workspaceAssistant).toHaveBeenCalledWith(intent);
  const find = (type: string, label?: string) => root!.container.queryAll((node) => node.type === type && (!label || node.props.label === label));
  await act(async () => {
    find("TextInput")[0]!.props.onChangeText("Attract more bakery customers");
  });
  await act(async () => {
    root!.container
      .queryAll((node) => node.type === "Pressable" && node.props.accessibilityLabel === (state.locale === "ar" ? "إرسال" : "Send"))[0]!
      .props.onPress();
  });
  expect(state.api.messageWorkspaceAssistant).toHaveBeenCalledWith(expect.objectContaining({ intent, message: "Attract more bakery customers" }));
  expect(state.api.confirmWorkspaceAssistant).not.toHaveBeenCalled();
  expect(state.api.createContent).not.toHaveBeenCalled();
  await act(async () => {
    find("Button", state.locale === "ar" ? "تأكيد وبدء" : "Confirm and start")[0]!.props.onPress();
  });
  expect(state.api.confirmWorkspaceAssistant).toHaveBeenCalledTimes(1);
  if (intent === "CONTENT") expect(find("TextAction", "Open draft")).toHaveLength(1);
  if (intent === "CAMPAIGN") expect(find("TextAction", "فتح الحملة")).toHaveLength(1);
  if (intent === "STRATEGY") {
    expect(
      find("Txt")
        .map((node) => node.props.children)
        .join(" ")
    ).toContain("Prepare next week");
    expect(
      find("Txt")
        .map((node) => node.props.children)
        .join(" ")
    ).not.toContain("PRIVATE/technical-source");
  }
});

it("keeps unsent goals separate between areas and workspace identities", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  state.stores.clear();
  state.locale = "en";
  state.scope = "owner:workspace";
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.api.workspaceAssistant.mockResolvedValue([]);
  root = createRoot();
  const render = async (intent: TaskIntent) => {
    await act(async () =>
      root!.render(
        <QueryClientProvider client={state.client!}>
          <WorkspaceAssistantScreen embedded intent={intent} />
        </QueryClientProvider>
      )
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  };
  const field = () => root!.container.queryAll((node) => node.type === "TextInput")[0]!;
  await render("CONTENT");
  await act(async () => field().props.onChangeText("Private unsent content goal"));
  await render("STRATEGY");
  expect(field().props.value).toBe("");
  state.scope = "colleague:workspace";
  await render("CONTENT");
  expect(field().props.value).toBe("");
  state.scope = "owner:workspace";
  await render("CONTENT");
  expect(field().props.value).toBe("Private unsent content goal");
  expect(state.api.messageWorkspaceAssistant).not.toHaveBeenCalled();
});

it("keeps existing Home conversations compact and retries the same saved request", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  state.stores.clear();
  state.locale = "en";
  state.scope = "owner:workspace";
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.api.workspaceAssistant.mockResolvedValue([
    {
      id: "previous",
      message: "Plan a fictional launch",
      reply: "Your campaign is ready.",
      status: "COMPLETED",
      campaignId: "campaign",
      createdAt: new Date().toISOString()
    }
  ]);
  state.api.assistantChats.mockResolvedValue({
    items: [{ id: "home", title: "Earlier conversation", legacy: true, updatedAt: new Date().toISOString() }],
    nextCursor: null
  });
  state.api.assistantChatMessages.mockImplementation(async () => ({ turns: await state.api.workspaceAssistant(), nextBefore: null }));
  state.api.messageWorkspaceAssistant.mockRejectedValueOnce(new Error("Network lost")).mockImplementationOnce(async (input) => ({
    id: input.requestId,
    message: input.message,
    reply: "Let’s continue",
    status: "DISCUSSION",
    createdAt: new Date().toISOString()
  }));
  root = createRoot();
  await act(() =>
    root!.render(
      <QueryClientProvider client={state.client!}>
        <WorkspaceAssistantScreen />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const text = root.container
    .queryAll((n) => n.type === "Txt")
    .map((n) => JSON.stringify(n.props.children))
    .join(" ");
  expect(text).not.toContain("What shall we create?");
  expect(text).not.toContain("You approve before publishing.");
  expect(root.container.queryAll((n) => n.type === "TextAction" && n.props.label === "Open campaign")).toHaveLength(1);
  const field = () => root!.container.queryAll((n) => n.type === "TextInput")[0]!;
  await act(() => field().props.onChangeText("Follow up on the launch"));
  const press = async (label: string) =>
    act(async () => {
      await root!.container.queryAll((n) => n.type === "Pressable" && n.props.accessibilityLabel === label)[0]!.props.onPress();
    });
  await press("Send");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const request = state.api.messageWorkspaceAssistant.mock.calls[0]![0];
  expect(state.stores.get("owner:workspace:assistant:chat:home")).toMatchObject({ pending: { requestId: request.requestId } });
  await press("Retry saved message");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(state.api.messageWorkspaceAssistant.mock.calls[1]![0]).toEqual(request);
  expect(field().props.value).toBe("");
});

it("switches Home threads, restores each unsent message, and opens a saved campaign card", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  state.stores.clear();
  state.locale = "en";
  state.scope = "owner:workspace";
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.api.assistantChats.mockResolvedValue({
    items: [{ id: "campaign-chat", title: "Pearl launch", legacy: false, updatedAt: new Date().toISOString() }],
    nextCursor: null
  });
  state.api.assistantChatMessages.mockResolvedValue({
    turns: [
      {
        id: "result",
        message: "Create the launch plan",
        reply: "Your campaign is ready.",
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
        result: {
          kind: "CAMPAIGN",
          id: "saved-campaign",
          title: "Pearl launch",
          summary: "A week of launch posts",
          postCount: 7,
          durationDays: 7,
          publishesPerDay: 1
        }
      }
    ],
    nextBefore: null
  });
  root = createRoot();
  await act(() =>
    root!.render(
      <QueryClientProvider client={state.client!}>
        <WorkspaceAssistantScreen />
      </QueryClientProvider>
    )
  );
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  await settle();
  const field = () => root!.container.queryAll((n) => n.type === "TextInput")[0]!;
  await act(() => field().props.onChangeText("Unsent launch revision"));
  await act(() => root!.container.queryAll((n) => n.type === "Pressable" && n.props.accessibilityLabel === "Open campaign: Pearl launch")[0]!.props.onPress());
  expect(state.push).toHaveBeenCalledWith({ pathname: "/campaign/[id]", params: { id: "saved-campaign" } });
  await act(() => root!.container.queryAll((n) => n.type === "IconButton" && n.props.label === "New chat")[0]!.props.onPress());
  await settle();
  expect(field().props.value).toBe("");
  await act(() => field().props.onChangeText("A completely different task"));
  await act(() => root!.container.queryAll((n) => n.type === "ListRow" && n.props.label === "Pearl launch")[0]!.props.onPress());
  await settle();
  expect(field().props.value).toBe("Unsent launch revision");
  expect(state.api.messageWorkspaceAssistant).not.toHaveBeenCalled();
  expect(state.stores.get("owner:workspace:assistant:chat:campaign-chat")).toMatchObject({ message: "Unsent launch revision" });
});
