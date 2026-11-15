import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ locale: "en", client: null as QueryClient | null, list: vi.fn(), forget: vi.fn(), epoch: vi.fn() }));
vi.mock("../src/providers", () => ({
  useAccount: () => ({ api: { personalMemory: state.list, forgetMemory: state.forget }, scope: "user:workspace", epoch: 1, queryClient: state.client }),
  useAppearance: () => ({ t: (en: string, ar: string) => (state.locale === "ar" ? ar : en) })
}));
vi.mock("../src/auth/transport", () => ({ sessionController: { assertEpoch: state.epoch } }));
vi.mock("../src/errors", () => ({ errorMessage: () => "Try again" }));
vi.mock("../src/ui", async () => {
  const { createElement } = await import("react");
  return Object.fromEntries(
    ["Card", "Loading", "Notice", "Sheet", "TextAction", "Txt"].map((tag) => [
      tag,
      (props: Record<string, unknown>) => createElement(tag, props, props.children as React.ReactNode)
    ])
  );
});
import { PersonalMemorySheet } from "../src/personal-memory";
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  state.client?.clear();
});
it.each(["en", "ar"])("reviews and forgets personal defaults with retry after failure (%s)", async (locale) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.locale = locale;
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.list.mockReset().mockResolvedValue([{ id: "preference", key: "LANGUAGE", text: "Arabic first", updatedAt: "2026-11-15" }]);
  state.forget.mockReset().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  root = createRoot();
  await act(async () => {
    root!.render(
      <QueryClientProvider client={state.client!}>
        <PersonalMemorySheet onClose={() => {}} />
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const label = locale === "ar" ? "نسيان" : "Forget";
  const actions = () => root!.container.queryAll((node) => node.type === "TextAction");
  expect(actions()[0]!.props.label).toBe(label);
  await act(async () => {
    actions()[0]!.props.onPress();
  });
  expect(root!.container.queryAll((node) => node.type === "Notice")[0]!.props.children).toBe("Try again");
  expect(actions()).toHaveLength(1);
  await act(async () => {
    actions()[0]!.props.onPress();
  });
  expect(actions()).toHaveLength(0);
  expect(state.forget).toHaveBeenCalledTimes(2);
  expect(state.epoch).toHaveBeenCalledWith(1);
});
