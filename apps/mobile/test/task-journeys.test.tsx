import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaskIntent } from "@markos/shared-types";
const state = vi.hoisted(() => ({
  scope: "owner:workspace",
  locale: "en",
  client: null as QueryClient | null,
  api: { workspaceAssistant: vi.fn(), messageWorkspaceAssistant: vi.fn(), confirmWorkspaceAssistant: vi.fn(), createContent: vi.fn() },
  push: vi.fn(),
  stores: new Map<string, unknown>()
}));
vi.mock("react-native", () => ({ View: "View", RefreshControl: "RefreshControl", ScrollView: "ScrollView" }));
vi.mock("lucide-react-native", () => ({ Send: () => null, Ellipsis: () => null }));
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
    constructor(scope: string, _epoch: number, kind: string) {
      this.key = `${scope}:${kind}`;
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
    TaskFeedback: ({ label }: { label: string }) => createElement("TaskFeedback", {}, label),
    Enter: ({ children }: React.PropsWithChildren) => children
  };
});
vi.mock("../src/ui", async () => {
  const { createElement } = await import("react");
  return Object.fromEntries(
    ["Button", "Card", "Disclosure", "Field", "Loading", "Notice", "Screen", "Txt", "TextAction", "Row", "IconButton"].map((tag) => [
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
    find("Field")[0]!.props.onChangeText("Attract more bakery customers");
  });
  await act(async () => {
    find("Button", state.locale === "ar" ? "إرسال" : "Send")[0]!.props.onPress();
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
  const field = () => root!.container.queryAll((node) => node.type === "Field")[0]!;
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
