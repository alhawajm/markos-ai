import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContentRecord, ContentConversationRecord, MediaAssetRecord, ContentAuthoringOperation } from "@markos/shared-types";
import { draft, item } from "./create-fixtures";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
let browser: Browser;
const session = {
  mfaVerified: true,
  tokens: { accessToken: "create-fixture", expiresIn: 900 },
  user: { id: "create-owner", email: "owner@snacklab.test", fullName: "Owner", locale: "en", isVerified: true },
  workspace: { id: "workspace-1", name: "SnackLab", slug: "snacklab" },
  roles: ["OWNER"]
};
const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
const fail = (code = "CONTENT_REVISION_CONFLICT", status = 409) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({
    error: {
      code,
      message:
        code === "CONTENT_REVISION_CONFLICT"
          ? "This draft changed. Refresh and review."
          : code === "CONTENT_NOT_READY"
            ? "CONTENT_NOT_READY: Attach media to every slide."
            : "Please retry this action."
    }
  })
});
function asset(id = "photo"): MediaAssetRecord {
  return {
    id,
    workspaceId: "workspace-1",
    filename: `${id}.jpg`,
    mimeType: "image/jpeg",
    type: "IMAGE",
    width: 1080,
    height: 1080,
    sizeBytes: 1000,
    publicUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#eec7a4"/><circle cx="540" cy="440" r="290" fill="#b86d3b"/><text x="540" y="840" text-anchor="middle" font-size="70" fill="#382614">SnackLab</text></svg>')}`,
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z"
  };
}
async function setup(initial: ContentRecord) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => console.error("CREATE PAGE ERROR", error.message));
  const state = {
    record: structuredClone(initial),
    media: [asset(), asset("replacement")],
    calls: [] as { path: string; body: Record<string, unknown> }[],
    counter: 1,
    failSave: false,
    failImage: false,
    aiCaption: "MARKOS applied caption",
    messages: [] as ContentConversationRecord["messages"],
    latestRun: null as ContentConversationRecord["latestRun"]
  };
  const thread = (): ContentConversationRecord => ({ id: "thread-1", contentItem: state.record, messages: state.messages, latestRun: state.latestRun });
  const bump = () => {
    state.record = { ...state.record, revision: state.record.revision + 1 };
  };
  await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
    roles: session.roles,
    user: session.user,
    workspace: session.workspace
  });
  await page.route(/^http:\/\/(?:localhost|127\.0\.0\.1):4000\//, async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    const body = (route.request().postData() ? route.request().postDataJSON() : {}) as Record<string, unknown>;
    if (method !== "GET") state.calls.push({ path, body });
    if (path === "/v1/auth/refresh") return route.fulfill(json(session));
    if (path === "/v1/onboarding")
      return route.fulfill(
        json({ businessProfile: { status: "APPROVED" }, status: "COMPLETE", modules: [], onboardingScore: 100, vaultScore: { score: 100 } })
      );
    if (path === "/v1/campaigns/summaries") return route.fulfill(json({ items: [], nextCursor: null }));
    if (path === "/v1/workspace/instagram") return route.fulfill(json({ status: "CONNECTED", username: "the.snacklab" }));
    if (path.includes("/instagram/learning")) return route.fulfill(json({ status: "APPLIED" }));
    if (path === "/v1/media") return route.fulfill(json(state.media));
    if (path.endsWith("/publish-job/latest") || path.endsWith("/media-generation/latest")) return route.fulfill(json(null));
    if (path === "/v1/content" && method === "POST") {
      state.record = draft({ id: "new-draft", mediaItems: [item("new-item", "new-draft")] });
      return route.fulfill(json(state.record));
    }
    if (path === `/v1/content/${state.record.id}` && method === "DELETE") {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      return route.fulfill(json({ id: state.record.id }));
    }
    if (path === "/v1/content" && method === "GET") return route.fulfill(json([state.record]));
    if (path === `/v1/content/${state.record.id}` && method === "GET") return route.fulfill(json(state.record));
    if (path.endsWith("/conversation") && method === "GET") return route.fulfill(json(thread()));
    if (path.endsWith("/conversation") && method === "POST") {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      state.messages.push({ id: `u-${++state.counter}`, runId: "run", role: "user", text: String(body.message), createdAt: new Date().toISOString() });
      state.record = {
        ...state.record,
        caption: state.aiCaption,
        tone: "Warm",
        mediaItems: state.record.mediaItems.map((m, i) => (i === 0 ? { ...m, visualDirection: "Warm bakery portrait" } : m))
      };
      bump();
      state.messages.push({
        id: `a-${++state.counter}`,
        runId: "run",
        role: "assistant",
        text: "Changes saved to the draft.",
        createdAt: new Date().toISOString()
      });
      state.latestRun = { id: "run", requestId: String(body.requestId), status: "SUCCEEDED", errorCode: null, proposedCaption: null };
      return route.fulfill(json(thread()));
    }
    if (path.endsWith("/confirm")) {
      if (body.expectedRevision !== state.record.revision || body.confirmationToken !== "proposal-token") return route.fulfill(fail());
      state.record.mediaItems = state.record.mediaItems.slice(0, 1);
      bump();
      state.latestRun = null;
      return route.fulfill(json(thread()));
    }
    if (path.endsWith("/mutate")) {
      if (state.failSave) return route.fulfill(fail("UNAVAILABLE", 503));
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      for (const op of body.operations as ContentAuthoringOperation[]) {
        if (op.type === "updateContent") state.record = { ...state.record, ...op.fields } as ContentRecord;
        if (op.type === "updateMediaItem")
          state.record.mediaItems = state.record.mediaItems.map((m) => (m.id === op.itemId ? { ...m, ...op.fields } : m)) as ContentRecord["mediaItems"];
        if (op.type === "addMediaItem")
          state.record.mediaItems.push({
            ...item(`slide-${++state.counter}`, state.record.id),
            position: state.record.mediaItems.length,
            ...op.fields
          } as ContentRecord["mediaItems"][number]);
        if (op.type === "removeMediaItem") state.record.mediaItems = state.record.mediaItems.filter((m) => m.id !== op.itemId);
        if (op.type === "reorderMediaItems")
          state.record.mediaItems = op.orderedIds.map((id, position) => ({ ...state.record.mediaItems.find((m) => m.id === id)!, position }));
        if (op.type === "updateReelScript" || op.type === "addReelBeat")
          state.record.reelScript ??= {
            id: "script-1",
            workspaceId: state.record.workspaceId,
            contentItemId: state.record.id,
            hook: null,
            intendedDurationSeconds: null,
            beats: [],
            createdAt: state.record.createdAt,
            updatedAt: state.record.updatedAt
          };
        if (op.type === "updateReelScript") Object.assign(state.record.reelScript!, op.fields);
        if (op.type === "addReelBeat")
          state.record.reelScript!.beats.push({
            id: `beat-${++state.counter}`,
            workspaceId: state.record.workspaceId,
            reelScriptId: state.record.reelScript!.id,
            position: state.record.reelScript!.beats.length,
            text: op.text,
            createdAt: state.record.createdAt,
            updatedAt: state.record.updatedAt
          });
        if (op.type === "updateReelBeat")
          state.record.reelScript!.beats = state.record.reelScript!.beats.map((b) => (b.id === op.beatId ? { ...b, text: op.text } : b));
        if (op.type === "removeReelBeat") state.record.reelScript!.beats = state.record.reelScript!.beats.filter((b) => b.id !== op.beatId);
        if (op.type === "reorderReelBeats")
          state.record.reelScript!.beats = op.orderedIds.map((id, position) => ({ ...state.record.reelScript!.beats.find((b) => b.id === id)!, position }));
      }
      bump();
      return route.fulfill(json(state.record));
    }
    if (path.endsWith("/generate-image")) {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      if (state.failImage) {
        state.media.push(asset("retained"));
        return route.fulfill(fail("MEDIA_GENERATION_SUPERSEDED", 409));
      }
      const generated = asset(`generated-${++state.counter}`);
      state.media.push(generated);
      state.record.mediaItems = state.record.mediaItems.map((m) => (m.id === body.contentMediaItemId ? { ...m, mediaAssetId: generated.id } : m));
      bump();
      return route.fulfill(json({ contentItem: state.record, mediaAsset: generated, model: "test", prompt: "item direction", promptVersion: "test" }));
    }
    if (path.endsWith("/media") && method === "POST") {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      state.record.mediaItems = state.record.mediaItems.map((m) => (m.id === body.contentMediaItemId ? { ...m, mediaAssetId: String(body.mediaAssetId) } : m));
      bump();
      return route.fulfill(json(state.record));
    }
    if (path.includes("/media/") && method === "DELETE") {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      state.record.mediaItems = state.record.mediaItems.map((m) => (m.id === path.split("/").at(-1) ? { ...m, mediaAssetId: null } : m));
      bump();
      return route.fulfill(json(state.record));
    }
    if (path.endsWith("/status")) {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      if (
        body.status === "APPROVED" &&
        (state.record.mediaItems.some((m) => !m.mediaAssetId) || (state.record.contentType !== "STORY" && !state.record.caption))
      )
        return route.fulfill(fail("CONTENT_NOT_READY", 422));
      state.record = { ...state.record, status: body.status as ContentRecord["status"] };
      bump();
      return route.fulfill(json(state.record));
    }
    if (path.endsWith("/convert")) {
      if (body.expectedRevision !== state.record.revision) return route.fulfill(fail());
      const selected = String(body.retainMediaItemId ?? "");
      const preview = {
        from: state.record.contentType,
        to: body.contentType,
        requiresSelection: state.record.mediaItems.length > 1 && !selected,
        requiresConfirmation: state.record.mediaItems.length > 1,
        retainedItemId: selected || null,
        removedItemIds: selected ? state.record.mediaItems.filter((m) => m.id !== selected).map((m) => m.id) : [],
        detachedAssetIds: [],
        resetFields: []
      };
      if (body.confirmDestructive) {
        state.record = {
          ...state.record,
          contentType: body.contentType as ContentRecord["contentType"],
          mediaItems: state.record.mediaItems.filter((m) => m.id === selected),
          reelScript: null
        };
        bump();
        return route.fulfill(json({ applied: true, content: state.record, preview }));
      }
      return route.fulfill(json({ applied: false, content: state.record, preview }));
    }
    return route.fulfill(json([]));
  });
  await page.goto(`${baseUrl}/en/app/content-studio?item=${initial.id}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByTestId("create-workspace").waitFor();
  return { page, context, state };
}
async function screenshot(page: import("playwright-core").Page, name: string) {
  const directory = process.env.CREATE_SCREENSHOT_DIR;
  if (directory) {
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${name}.png`) });
  }
}
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
});
afterAll(async () => {
  await browser?.close();
});
describe("Relational Create workspace", () => {
  it("authors carousel slides by stable identity, generates/replaces media and previews the persisted order", async () => {
    const h = await setup(
      draft({
        contentType: "CAROUSEL",
        caption: "A fresh introduction",
        mediaItems: [
          { ...item(), mediaAssetId: "photo", title: "Welcome", visualDirection: "Warm bakery" },
          { ...item("item-2"), position: 1, title: "Our craft" }
        ]
      })
    );
    const { page, state } = h;
    try {
      await page.getByRole("button", { name: "Add slide", exact: true }).click();
      await expect.poll(() => state.record.mediaItems.length).toBe(3);
      const created = state.record.mediaItems[2]!.id;
      await page.getByLabel("Purpose", { exact: true }).fill("CTA");
      await page.getByLabel("Slide title", { exact: true }).fill("Visit us");
      await page.getByLabel("Visual direction", { exact: true }).fill("Warm counter with fresh pastries");
      await page.getByRole("button", { name: "Move slide 3 earlier", exact: true }).click();
      await expect.poll(() => state.record.mediaItems[1]!.id).toBe(created);
      expect(await page.locator("[data-selected-item]").getAttribute("data-selected-item")).toBe(created);
      expect(state.record.mediaItems[1]!.title).toBe("Visit us");
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      await expect.poll(() => state.record.mediaItems[1]!.mediaAssetId).toMatch(/^generated/);
      expect(state.calls.find((c) => c.path.endsWith("generate-image"))?.body.contentMediaItemId).toBe(created);
      await page.getByRole("button", { name: "Library", exact: true }).click();
      await page.getByTitle("replacement.jpg", { exact: true }).click();
      expect(state.record.mediaItems[1]!.mediaAssetId).not.toBe("replacement");
      await page.getByRole("button", { name: "Attach selected", exact: true }).click();
      await expect.poll(() => state.record.mediaItems[1]!.mediaAssetId).toBe("replacement");
      await page.getByLabel("Message MARKOS").fill("Keep this question");
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await page.locator(".studio-instagram").waitFor({ state: "visible" });
      expect(await page.locator("[data-selected-item]").getAttribute("data-selected-item")).toBe(created);
      await screenshot(page, "carousel-preview");
      await page.getByRole("button", { name: "Assistant", exact: true }).click();
      expect(await page.getByLabel("Message MARKOS").inputValue()).toBe("Keep this question");
      await page.getByRole("button", { name: "Remove slide", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
      await expect.poll(() => state.record.mediaItems.length).toBe(2);
      expect(state.media.some((m) => m.id === "replacement")).toBe(true);
      await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "CONTENT_NOT_READY" }).waitFor();
      expect(state.record.status).toBe("DRAFT");
      await page.getByLabel("Content type", { exact: true }).selectOption("POST");
      await page.getByLabel("Slide to keep").selectOption("item-1");
      await page.getByRole("button", { name: "Review conversion", exact: true }).click();
      await page.getByRole("button", { name: "Confirm conversion", exact: true }).click();
      await expect.poll(() => state.record.contentType).toBe("POST");
      expect(state.record.mediaItems.map((m) => m.id)).toEqual(["item-1"]);
      expect(await page.locator(".create-slide-strip").count()).toBe(0);
    } finally {
      await h.context.close();
    }
  });
  it("keeps Post single-item, flushes before MARKOS and reconciles its fields and readiness", async () => {
    const h = await setup(draft({ caption: "Our launch", mediaItems: [{ ...item(), mediaAssetId: "photo" }] }));
    const { page, state } = h;
    try {
      expect(await page.locator(".create-slide-strip").count()).toBe(0);
      await page.getByLabel("Visual direction", { exact: true }).fill("Fresh pastry portrait");
      await page.getByLabel("Message MARKOS").fill("Develop the caption and direction");
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      await expect.poll(() => state.messages.length).toBe(2);

      await expect.poll(() => page.getByLabel("Visual direction", { exact: true }).inputValue()).toBe("Warm bakery portrait");
      const writes = state.calls.filter((c) => c.path.endsWith("/mutate") || c.path.endsWith("/conversation"));
      expect(writes[0]!.path).toContain("mutate");
      expect(writes[1]!.body.expectedRevision).toBe(3);
      await page.getByRole("button", { name: "Caption", exact: true }).click();
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe(state.aiCaption);
      await page.getByRole("button", { name: "Details", exact: true }).click();
      expect(await page.getByLabel("Tone", { exact: true }).inputValue()).toBe("Warm");
      await page.getByRole("button", { name: "Media", exact: true }).click();
      const box = await page.locator(".create-companion").boundingBox();
      expect(box!.width).toBeGreaterThan(440);
      await screenshot(page, "post-assistant");
      await page.getByRole("button", { name: "Caption", exact: true }).click();
      await page.getByLabel("Caption", { exact: true }).fill("Owner final caption");
      await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
      await expect.poll(() => state.record.status).toBe("APPROVED");
      expect(state.record.caption).toBe("Owner final caption");
      expect(await page.getByLabel("Caption", { exact: true }).isDisabled()).toBe(true);
      await page.getByRole("button", { name: "Return to Draft", exact: true }).click();
      await expect.poll(() => state.record.status).toBe("DRAFT");
      await page.reload();
      await page.getByTestId("create-workspace").waitFor();
      await expect.poll(() => page.locator(".create-message").count()).toBe(2);
      await page.getByRole("button", { name: "Caption", exact: true }).click();
      await page.getByLabel("Caption", { exact: true }).fill("Final edit before deletion");
      await page.getByLabel("More actions", { exact: true }).click();
      await page.getByRole("button", { name: "Delete draft", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
      await expect.poll(() => state.record.id).toBe("new-draft");
      const deletion = state.calls.findIndex((c) => c.path === "/v1/content/draft-1");
      expect(deletion).toBeGreaterThan(0);
      expect(state.calls[deletion]!.body.expectedRevision).toBeGreaterThan(3);
      expect(state.calls[deletion - 1]!.path).toContain("/mutate");
    } finally {
      await h.context.close();
    }
  });
  it("supports one Story image or video without a Caption tab, and marks an image Story Ready without caption", async () => {
    const h = await setup(draft({ contentType: "STORY", caption: "", mediaItems: [{ ...item(), aspectRatio: "VERTICAL" }] }));
    const { page, state } = h;
    try {
      expect(await page.getByRole("button", { name: "Caption", exact: true }).count()).toBe(0);
      expect(await page.locator(".create-slide-strip").count()).toBe(0);
      await page.getByLabel("Media format", { exact: true }).selectOption("VIDEO");
      await page.getByLabel("Generated clip duration").waitFor();
      await page.getByLabel("Generated clip duration").selectOption("12");
      await page.getByLabel("Media format", { exact: true }).selectOption("IMAGE");
      await expect.poll(() => state.record.mediaItems[0]!.mediaKind).toBe("IMAGE");
      await page.getByRole("button", { name: "Library", exact: true }).click();
      await page.getByTitle("photo.jpg", { exact: true }).click();
      await page.getByRole("button", { name: "Attach selected", exact: true }).click();
      await expect.poll(() => state.record.mediaItems[0]!.mediaAssetId).toBe("photo");
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await page.locator(".studio-instagram-vertical").waitFor({ state: "visible" });
      expect(await page.locator(".studio-instagram-caption").count()).toBe(0);
      expect(await page.getByRole("combobox", { name: /device/i }).count()).toBe(0);
      await screenshot(page, "story-preview");
      await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
      await expect.poll(() => state.record.status).toBe("APPROVED");
      expect(state.record.caption).toBe("");
    } finally {
      await h.context.close();
    }
  });
  it("edits Reel script and stable beats separately from generated clip duration", async () => {
    const h = await setup(
      draft({ contentType: "REEL", mediaItems: [{ ...item(), mediaKind: "VIDEO", aspectRatio: "VERTICAL", generationDurationSeconds: 8 }] })
    );
    const { page, state } = h;
    try {
      await page.getByLabel("Hook", { exact: true }).fill("Watch the first pour");
      await page.getByLabel("Intended Reel duration (seconds)", { exact: true }).fill("30");
      await page.getByRole("button", { name: "Add beat", exact: true }).click();
      await page.getByLabel("Beat 1", { exact: true }).fill("Open on fresh coffee");
      await page.getByRole("button", { name: "Add beat", exact: true }).click();
      await page.getByLabel("Beat 2", { exact: true }).fill("Finish with our invitation");
      const first = state.record.reelScript!.beats[0]!.id;
      await page.getByRole("button", { name: "Move beat 2 earlier", exact: true }).click();
      await expect.poll(() => state.record.reelScript!.beats[1]!.id).toBe(first);
      expect(state.record.reelScript!.beats[0]!.text).toBe("Finish with our invitation");
      await page.getByLabel("Generated clip duration", { exact: true }).selectOption("12");
      await expect.poll(() => state.record.mediaItems[0]!.generationDurationSeconds).toBe(12);
      expect(state.record.reelScript!.intendedDurationSeconds).toBe(30);
      await page.getByRole("button", { name: "Remove beat 2", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
      await expect.poll(() => state.record.reelScript!.beats.length).toBe(1);
      expect(state.record.reelScript!.hook).toBe("Watch the first pour");
    } finally {
      await h.context.close();
    }
  });
  it("preserves failed saves and conflicting text, then explicitly reconciles; recovers retained generation via Library", async () => {
    const h = await setup(draft({ caption: "Saved", mediaItems: [{ ...item(), visualDirection: "Pastry" }] }));
    const { page, state } = h;
    try {
      state.failSave = true;
      await page.getByRole("button", { name: "Caption", exact: true }).click();
      await page.getByLabel("Caption", { exact: true }).fill("Preserve me");
      await page.getByRole("button", { name: "Retry save", exact: true }).waitFor();
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Preserve me");
      state.failSave = false;
      state.record = { ...state.record, revision: 9, caption: "Changed elsewhere" };
      await page.getByRole("button", { name: "Retry save", exact: true }).click();
      await page.getByRole("button", { name: "Review conflict", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByText(/Changed elsewhere/)
        .waitFor();
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Preserve me");
      await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
      await expect.poll(() => state.record.caption).toBe("Preserve me");
      await page.getByRole("button", { name: "Media", exact: true }).click();
      state.failImage = true;
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Please retry" }).waitFor();
      await page.getByRole("button", { name: "Library", exact: true }).click();
      await page.getByTitle("retained.jpg", { exact: true }).click();
      await page.getByRole("button", { name: "Attach selected", exact: true }).click();
      await expect.poll(() => state.record.mediaItems[0]!.mediaAssetId).toBe("retained");
      expect(state.calls.filter((c) => c.path.endsWith("generate-image"))).toHaveLength(1);
    } finally {
      await h.context.close();
    }
  });
});
it("surfaces server-issued destructive proposals, rejects stale confirmation, and preserves reader scroll during polling", async () => {
  const h = await setup(
    draft({
      contentType: "CAROUSEL",
      mediaItems: [
        { ...item(), title: "Keep" },
        { ...item("item-2"), title: "Remove", position: 1 }
      ]
    })
  );
  const { page, state } = h;
  try {
    state.latestRun = {
      id: "proposal-run",
      requestId: "proposal",
      status: "AWAITING_CONFIRMATION",
      errorCode: null,
      proposedCaption: null,
      confirmation: { token: "proposal-token", revision: state.record.revision, consequences: ["Remove populated slide 2."] }
    };
    await page.reload();
    await page.getByRole("button", { name: "Confirm changes", exact: true }).waitFor();
    await page.getByLabel("Visual direction", { exact: true }).fill("Keep my pending direction");
    await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "This draft changed" }).first().waitFor();
    expect(state.record.mediaItems).toHaveLength(2);
    expect(state.record.mediaItems[0]!.visualDirection).toBe("Keep my pending direction");
    const confirmation = state.calls.find((c) => c.path.endsWith("/confirm"));
    expect(confirmation?.body).toEqual({ confirmationToken: "proposal-token", expectedRevision: 2 });
    state.latestRun.confirmation!.revision = state.record.revision;
    await page.reload();
    await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
    await expect.poll(() => state.record.mediaItems.length).toBe(1);
    state.latestRun = { id: "working", requestId: "working", status: "RUNNING", errorCode: null, proposedCaption: null };
    state.messages = Array.from({ length: 30 }, (_, i) => ({
      id: `history-${i}`,
      runId: "working",
      role: "assistant" as const,
      text: `Message ${i}. A long discussion of the campaign direction and the next creative decision.`,
      createdAt: new Date().toISOString()
    }));
    await page.reload();
    await expect.poll(() => page.locator(".create-message").count()).toBe(30);
    await page.locator(".create-transcript").evaluate((node) => {
      node.scrollTop = 0;
      node.dispatchEvent(new Event("scroll"));
    });
    state.messages.push({
      id: "incoming",
      runId: "working",
      role: "assistant",
      text: "Another update while you read history.",
      createdAt: new Date().toISOString()
    });
    state.latestRun.status = "SUCCEEDED";
    await expect.poll(() => page.locator(".create-message").count(), { timeout: 5000 }).toBe(31);
    expect(await page.locator(".create-transcript").evaluate((node) => node.scrollTop)).toBeLessThan(10);
  } finally {
    await h.context.close();
  }
});
