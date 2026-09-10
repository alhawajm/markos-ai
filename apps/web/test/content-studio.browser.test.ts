import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContentConversationRecord, ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { assertPlexFonts } from "./browser-fonts";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for Create browser tests");
let browser: Browser;
const session = {
  mfaVerified: true,
  mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
  tokens: { accessToken: "create-browser-fixture", expiresIn: 900 },
  user: { id: "create-owner", email: "owner@snacklab.test", fullName: "SnackLab Owner", locale: "en", isVerified: true },
  workspace: { id: "create-workspace", name: "SnackLab", slug: "snacklab" },
  roles: ["OWNER"]
};
const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
const failure = () => ({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Please retry this action." } })
});
function draft(overrides: Partial<ContentRecord> = {}): ContentRecord {
  return {
    revision: 1,
    id: "saved-post",
    workspaceId: session.workspace.id,
    platform: "INSTAGRAM",
    contentType: "POST",
    status: "DRAFT",
    caption: "Flaky layers. Citrus glaze. A little cardamom.\n\nطبقات هشة ولمسة من الهيل.\n\n#SnackLab",
    mediaIds: ["photo"],
    brief: "Orange-cardamom launch",
    createdAt: "2026-09-06T09:00:00.000Z",
    updatedAt: "2026-09-06T09:00:00.000Z",
    ...overrides
  };
}
function asset(id = "photo", width = 1080, height = 1350): MediaAssetRecord {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#eec7a4"/><circle cx="50%" cy="45%" r="28%" fill="#cc7a3f"/><text x="50%" y="80%" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#382614">${id} · test media</text></svg>`;
  return {
    id,
    workspaceId: session.workspace.id,
    filename: `${id}.jpg`,
    mimeType: "image/jpeg",
    type: "IMAGE",
    width,
    height,
    sizeBytes: 1000,
    publicUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    createdAt: "2026-09-06T09:00:00.000Z",
    updatedAt: "2026-09-06T09:00:00.000Z"
  };
}
function videoAsset(id = "clip"): MediaAssetRecord {
  return { ...asset(id, 1080, 1920), filename: `${id}.mp4`, mimeType: "video/mp4", type: "VIDEO", publicUrl: "data:video/mp4;base64,AAAA" };
}
async function setup(items: ContentRecord[] = [], media: MediaAssetRecord[] = [asset()]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const state = {
    items,
    media,
    creates: 0,
    conversations: {} as Record<string, ContentConversationRecord>,
    calls: [] as string[],
    failSave: false,
    failAi: false,
    failDetach: false,
    retainGeneratedImage: false,
    generatedImageErrorCode: "CONTENT_MEDIA_SINGLE_ITEM_LIMIT",
    attachConflict: null as MediaAssetRecord | null,
    aiHold: null as Promise<void> | null,
    jobStatus: null as string | null,
    jobOutputId: null as string | null,
    jobErrorCode: null as string | null,
    pollFailures: 0
  };
  await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
    roles: session.roles,
    user: session.user,
    workspace: session.workspace
  });
  await page.route(/^http:\/\/(?:localhost|127\.0\.0\.1):4000\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "/v1/auth/refresh") return route.fulfill(json(session));
    if (path === "/v1/onboarding")
      return route.fulfill(
        json({ businessProfile: { status: "APPROVED" }, status: "COMPLETE", modules: [], onboardingScore: 100, vaultScore: { score: 100 } })
      );
    const body = method === "GET" || method === "DELETE" ? {} : route.request().postDataJSON();
    if (method !== "GET") state.calls.push(`${method} ${path}`);
    const job = () => ({
      id: "video-job",
      contentItemId: state.items[0]?.id,
      status: state.jobStatus,
      progress: 40,
      outputMediaAssetId: state.jobOutputId,
      errorCode: state.jobErrorCode,
      errorMessage: state.jobErrorCode ? "The generated file is saved in the Media Library but could not be attached." : null
    });
    if (path.endsWith("/publish-job/latest")) return route.fulfill(json(null));
    if (path.endsWith("/media-generation/latest")) return route.fulfill(json(state.jobStatus ? job() : null));
    if (path === "/v1/media-generation/video-job") {
      if (state.pollFailures > 0) {
        state.pollFailures--;
        return route.fulfill(failure());
      }
      if (state.jobStatus === "COMPLETED") state.items[0] = { ...state.items[0]!, mediaIds: ["video-result"] };
      return route.fulfill(json(job()));
    }
    if (path === "/v1/content" && method === "GET") return route.fulfill(json(state.items));
    if (path === "/v1/content" && method === "POST") {
      if (state.failSave) return route.fulfill(failure());
      state.creates++;
      const record = draft({ ...body, id: `new-${state.creates}`, mediaIds: [] });
      state.items.push(record);
      return route.fulfill(json(record));
    }
    if (path === "/v1/content/ideate")
      return route.fulfill(
        json({
          caption: "An idea to review before applying.\n\nفكرة للمراجعة قبل التطبيق.\n\nDiscover more\n\n#Idea",
          contentPillar: "Offerings",
          visualDirection: "An overhead photo with orange slices."
        })
      );
    if (path === "/v1/media" && method === "GET") return route.fulfill(json(state.media));
    if (path === "/v1/media/upload") {
      const uploaded = { ...asset("upload", body.width, body.height), filename: body.filename };
      state.media.push(uploaded);
      return route.fulfill(json(uploaded));
    }
    const match = /^\/v1\/content\/([^/]+)(.*)$/.exec(path);
    const index = state.items.findIndex((item) => item.id === match?.[1]);
    const item = state.items[index];
    if (match && item) {
      const action = match[2];
      if (action === "/conversation") {
        const conversation = (state.conversations[item.id] ??= { id: `conversation-${item.id}`, contentItem: item, messages: [], latestRun: null });
        conversation.contentItem = item;
        if (method === "POST") {
          if (state.failAi) return route.fulfill(failure());
          const runId = `run-${conversation.messages.length}`;
          conversation.messages.push({ id: `${runId}-user`, runId, role: "user", text: body.message, createdAt: new Date().toISOString() });
          conversation.latestRun = { id: runId, requestId: body.requestId, status: "RUNNING", errorCode: null, proposedCaption: null };
          void (async () => {
            if (state.aiHold) await state.aiHold;
            const discussion = /hello|explore|options/i.test(body.message);
            if (!discussion) {
              item.caption = "Shorter citrus caption.\n\nنص عربي محدّث.\n\nTry it today";
              item.visualDirection = "An overhead photo with orange slices.";
              item.revision += 1;
            }
            conversation.messages.push({
              id: `${runId}-assistant`,
              runId,
              role: "assistant",
              text: discussion ? "Here are two directions to consider." : "The caption is updated and saved.",
              createdAt: new Date().toISOString()
            });
            conversation.latestRun!.status = "SUCCEEDED";
          })();
        }
        return route.fulfill(json(conversation));
      }
      if (method === "PATCH") {
        if (state.failSave) return route.fulfill(failure());
        Object.assign(item, body);
        item.revision += 1;
      }
      if (action === "/generate" || action === "/revise") {
        if (state.aiHold) await state.aiHold;
        if (state.failAi) return route.fulfill(failure());
        Object.assign(item, {
          caption: [action === "/generate" ? "Generated citrus launch caption." : "Shorter citrus caption.", "نص عربي محدّث.", "Try it today"]
            .filter(Boolean)
            .join("\n\n"),
          aiPromptUsed: "existing-action",
          contentPillar: "Offerings"
        });
      }
      if (action === "/media") {
        if (state.attachConflict) {
          state.media.push(state.attachConflict);
          item.mediaIds = [state.attachConflict.id];
          state.attachConflict = null;
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "CONTENT_MEDIA_SINGLE_ITEM_LIMIT", message: "Only one file can be attached." } })
          });
        }
        item.mediaIds = [...new Set([...item.mediaIds, body.mediaAssetId])];
      }
      if (action?.startsWith("/media/") && method === "DELETE") {
        if (state.failDetach) return route.fulfill(failure());
        item.mediaIds = item.mediaIds.filter((id) => id !== action.split("/")[2]);
      }
      if (action === "/generate-image") {
        const generated = { ...asset("generated"), type: "AI_GENERATED" as const };
        state.media.push(generated);
        if (state.retainGeneratedImage) {
          if (state.generatedImageErrorCode === "CONTENT_LOCKED") item.status = "APPROVED";
          if (state.generatedImageErrorCode === "CONTENT_NOT_FOUND") state.items.splice(index, 1);
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: state.generatedImageErrorCode,
                message: "Your generated file is saved in the Media Library but could not be attached.",
                details: [{ mediaAssetId: generated.id, savedToLibrary: true }]
              }
            })
          });
        }
        item.mediaIds.push(generated.id);
        return route.fulfill(json({ contentItem: item, mediaAsset: generated }));
      }
      if (action === "/status") item.status = body.status;
      if (action === "/schedule" || action === "/reschedule") Object.assign(item, { status: "SCHEDULED", scheduledAt: body.scheduledAt });
      if (action === "/unschedule") Object.assign(item, { status: "APPROVED", scheduledAt: null });
      return route.fulfill(json(item));
    }
    return route.fulfill(json([]));
  });
  return { page, state, close: () => context.close() };
}
async function open(page: Page, id?: string, locale = "en") {
  await page.goto(`${baseUrl}/${locale}/app/content-studio${id ? `?item=${id}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: locale === "ar" ? "تحرير النص" : "Edit caption", exact: true }).waitFor();
  try {
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".studio-edit-actions button")?.disabled);
    if (!id) await page.getByRole("button", { name: locale === "ar" ? "منشور" : "Post", exact: true }).click();
  } catch (cause) {
    await page.screenshot({ path: "evidence/create-load-failure.png" });
    throw cause;
  }
}
async function assistant(page: Page) {
  await page.getByLabel("Content type", { exact: true }).waitFor();
  const toggle = page.getByRole("button", { name: "Back to MARKOS", exact: true });
  if (await toggle.count()) await toggle.click();
}
async function preview(page: Page, locale = "en") {
  if (!(await page.locator(".studio-instagram").count())) {
    await page.getByRole("button", { name: locale === "ar" ? "عرض المعاينة" : "View preview", exact: true }).click();
  }
  await page.locator(".studio-instagram").waitFor();
}
async function edit(page: Page, caption: string) {
  await page.getByRole("button", { name: "Edit caption", exact: true }).click();
  await page.getByLabel("Caption", { exact: true }).fill(caption);
}

describe("unified Create", () => {
  it("opens a new Reel directly with video generation and compatible media controls", async () => {
    const { page, state, close } = await setup();
    try {
      await page.goto(`${baseUrl}/en/app/content-studio?type=REEL`, { waitUntil: "networkidle" });
      await expect.poll(() => page.getByLabel("Content type", { exact: true }).isEnabled()).toBe(true);
      expect(await page.getByLabel("Content type", { exact: true }).inputValue()).toBe("REEL");
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      expect(await page.getByRole("button", { name: "Upload JPEG", exact: true }).isDisabled()).toBe(true);
      await page.getByText("Generate media", { exact: true }).click();
      expect(await page.getByRole("button", { name: "Generate image", exact: true }).count()).toBe(0);
      await page.getByLabel("Visual direction", { exact: true }).fill("Slow overhead shot of the new dessert.");
      expect(await page.getByRole("button", { name: "Generate video", exact: true }).isEnabled()).toBe(true);
      expect(state.creates).toBe(0);
    } finally {
      await close();
    }
  });

  it("allows unavailable attached media to be removed without losing unsaved caption edits", async () => {
    const { page, state, close } = await setup([draft({ mediaIds: ["missing-file"] })], []);
    try {
      await open(page, "saved-post");
      await edit(page, "Keep my caption while repairing this draft.");
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      expect(await page.getByRole("button", { name: "Media Library", exact: true }).isDisabled()).toBe(true);
      await page.getByRole("button", { name: "Remove Unavailable media 1", exact: true }).click();
      await expect.poll(() => page.getByRole("button", { name: "Media Library", exact: true }).isEnabled()).toBe(true);
      expect(state.items[0]?.mediaIds).toEqual([]);
      expect(state.items[0]?.caption).toBe("Keep my caption while repairing this draft.");
    } finally {
      await close();
    }
  });

  it("blocks additional media for single-file formats and recovers after explicit removal", async () => {
    for (const type of ["POST", "REEL", "STORY"] as const) {
      const attachedFile = type === "REEL" ? videoAsset() : asset();
      const { page, state, close } = await setup(
        [draft({ contentType: type, mediaIds: [attachedFile.id] })],
        [attachedFile, asset("replacement"), videoAsset("other-video")]
      );
      try {
        await open(page, "saved-post");
        await page.getByRole("button", { name: "Edit media", exact: true }).click();
        await page
          .getByRole("region", { name: "Post editor", exact: true })
          .getByText("This format uses one media file. Remove the current file before adding another.", { exact: true })
          .waitFor();
        expect(await page.getByRole("button", { name: "Upload JPEG", exact: true }).isDisabled()).toBe(true);
        expect(await page.getByRole("button", { name: "Media Library", exact: true }).isDisabled()).toBe(true);
        expect(await page.getByRole("button", { name: "Attach JPEG", exact: true }).isDisabled()).toBe(true);
        await page.getByText("Generate media", { exact: true }).click();
        expect(await page.getByRole("button", { name: type === "REEL" ? "Generate video" : "Generate image", exact: true }).isDisabled()).toBe(true);
        expect(state.calls).toEqual([]);
        const remove = page.getByRole("button", { name: `Remove ${attachedFile.filename}`, exact: true });
        state.failDetach = true;
        await remove.click();
        await page.getByRole("alert").filter({ hasText: "Please retry this action." }).waitFor();
        expect(state.items[0]?.mediaIds).toEqual([attachedFile.id]);
        expect(await page.getByRole("button", { name: "Media Library", exact: true }).isDisabled()).toBe(true);
        state.failDetach = false;
        await remove.click();
        await expect.poll(() => page.getByRole("button", { name: "Media Library", exact: true }).isEnabled()).toBe(true);
        expect(state.items[0]?.mediaIds).toEqual([]);
        await page.getByRole("button", { name: "Media Library", exact: true }).click();
        const library = page.getByRole("dialog", { name: "Media Library", exact: true });
        expect(await library.getByRole("button", { name: /^replacement.jpg/ }).isDisabled()).toBe(type === "REEL");
        expect(await library.getByRole("button", { name: /^other-video.mp4/ }).isDisabled()).toBe(type === "POST");
        await library.getByRole("button", { name: type === "REEL" ? /^other-video.mp4/ : /^replacement.jpg/ }).click();
        await library.getByRole("button", { name: "Attach selected", exact: true }).click();
        await library.waitFor({ state: "hidden" });
        expect(state.items[0]?.mediaIds).toEqual([type === "REEL" ? "other-video" : "replacement"]);
        expect(await page.getByRole("region", { name: "MARKOS assistant", exact: true }).isVisible()).toBe(true);
      } finally {
        await close();
      }
    }
  });

  it("keeps all carousel images when a single-file format is rejected and enables it after removing extras", async () => {
    const media = Array.from({ length: 10 }, (_, index) => asset(`slide-${index + 1}`));
    const { page, state, close } = await setup([draft({ contentType: "CAROUSEL", mediaIds: media.map((file) => file.id) })], media);
    try {
      await open(page, "saved-post");
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      await page
        .getByRole("region", { name: "Post editor", exact: true })
        .getByText("This carousel already has 10 images. Remove an image before adding another.", { exact: true })
        .waitFor();
      expect(await page.getByRole("button", { name: "Upload JPEG", exact: true }).isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Media Library", exact: true }).isDisabled()).toBe(true);
      await page.getByText("Generate media", { exact: true }).click();
      expect(await page.getByRole("button", { name: "Generate image", exact: true }).isDisabled()).toBe(true);
      for (const type of ["POST", "REEL", "STORY"]) {
        await page.getByLabel("Content type", { exact: true }).selectOption(type);
        expect(await page.getByLabel("Content type", { exact: true }).inputValue()).toBe("CAROUSEL");
        expect(state.items[0]?.mediaIds).toEqual(media.map((file) => file.id));
      }
      expect(state.calls).toEqual([]);
      await page.getByRole("alert").filter({ hasText: "Remove extra media before changing the content type." }).waitFor();
      for (const [index, file] of media.slice(1).entries()) {
        await page.getByRole("button", { name: `Remove ${file.filename}`, exact: true }).click();
        await expect.poll(() => state.items[0]?.mediaIds.length).toBe(9 - index);
      }
      await page.getByLabel("Content type", { exact: true }).selectOption("POST");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Draft saved.", { exact: true }).waitFor();
      expect(state.items[0]?.contentType).toBe("POST");
      expect(state.items[0]?.mediaIds).toEqual(["slide-1"]);
      expect(state.items[0]?.caption).toBe(draft().caption);
      expect(state.media).toHaveLength(10);
    } finally {
      await close();
    }
  });

  it("recovers a generated image from the library when attachment fails without generating it again", async () => {
    const { page, state, close } = await setup([draft({ mediaIds: [] })], []);
    state.retainGeneratedImage = true;
    try {
      await open(page, "saved-post");
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      await page.getByText("Generate media", { exact: true }).click();
      await page.getByRole("button", { name: "Generate image", exact: true }).click();
      await page.getByRole("button", { name: "View saved media", exact: true }).click();
      const library = page.getByRole("dialog", { name: "Media Library", exact: true });
      await library.getByLabel("Media type", { exact: true }).selectOption("IMAGE");
      expect(
        await library
          .getByRole("button", { name: /^generated.jpg/ })
          .locator("img")
          .count()
      ).toBe(1);
      await library.getByRole("button", { name: /^generated.jpg/ }).click();
      await library.getByRole("button", { name: "Attach selected", exact: true }).click();
      await library.waitFor({ state: "hidden" });
      expect(state.items[0]?.mediaIds).toEqual(["generated"]);
      expect(state.calls.filter((call) => call.includes("generate-image"))).toHaveLength(1);
      expect(await page.getByRole("region", { name: "MARKOS assistant", exact: true }).isVisible()).toBe(true);
    } finally {
      await close();
    }
  });

  it("refreshes a retained image's post when another tab marks it Ready or deletes it", async () => {
    for (const code of ["CONTENT_LOCKED", "CONTENT_NOT_FOUND"]) {
      const { page, state, close } = await setup([draft({ mediaIds: [] })], []);
      state.retainGeneratedImage = true;
      state.generatedImageErrorCode = code;
      try {
        await open(page, "saved-post");
        await page.getByRole("button", { name: "Edit media", exact: true }).click();
        await page.getByText("Generate media", { exact: true }).click();
        await page.getByRole("button", { name: "Generate image", exact: true }).click();
        await page.getByText("Your generated file is saved in the Media Library. You can use it without generating again.", { exact: true }).waitFor();
        await expect.poll(() => page.getByRole("button", { name: "Generate image", exact: true }).isDisabled()).toBe(true);
        if (code === "CONTENT_LOCKED") {
          await page.getByRole("button", { name: "Return to Draft", exact: true }).waitFor();
          await page.getByRole("button", { name: "Edit caption", exact: true }).click();
          expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe(draft().caption);
          expect(await page.getByLabel("Caption", { exact: true }).isDisabled()).toBe(true);
        } else {
          await page.getByRole("alert").filter({ hasText: "This post is no longer available in this workspace." }).waitFor();
          expect(await page.getByRole("button", { name: "Leave", exact: true }).isEnabled()).toBe(true);
        }
        expect(state.media.map((file) => file.id)).toEqual(["generated"]);
      } finally {
        await close();
      }
    }
  });

  it("offers an existing video output instead of retrying generation after attachment failure", async () => {
    const { page, state, close } = await setup([draft({ contentType: "REEL", mediaIds: [] })], [{ ...videoAsset("retained-video"), type: "AI_GENERATED" }]);
    state.jobStatus = "FAILED";
    state.jobOutputId = "retained-video";
    try {
      await open(page, "saved-post");
      await page.getByRole("button", { name: "View saved media", exact: true }).click();
      expect(await page.getByRole("button", { name: "Retry video", exact: true }).count()).toBe(0);
      const library = page.getByRole("dialog", { name: "Media Library", exact: true });
      await library.getByLabel("Media type", { exact: true }).selectOption("VIDEO");
      expect(
        await library
          .getByRole("button", { name: /^retained-video.mp4/ })
          .locator("svg.lucide-film")
          .count()
      ).toBe(1);
      await library.getByRole("button", { name: /^retained-video.mp4/ }).click();
      await library.getByRole("button", { name: "Attach selected", exact: true }).click();
      await library.waitFor({ state: "hidden" });
      expect(state.items[0]?.mediaIds).toEqual(["retained-video"]);
      expect(state.calls).toEqual(["POST /v1/content/saved-post/media"]);
    } finally {
      await close();
    }
  });

  it("refreshes same-revision media after a concurrent attachment conflict and keeps the chosen caption and format", async () => {
    for (const locale of ["en", "ar"] as const) {
      const { page, state, close } = await setup([draft({ mediaIds: [] })], [asset("choice")]);
      const ar = locale === "ar";
      try {
        await page.emulateMedia({ colorScheme: ar ? "dark" : "light" });
        await open(page, "saved-post", locale);
        await page.getByLabel(ar ? "نص المنشور" : "Caption", { exact: true }).fill("Keep my chosen caption.");
        await page.getByLabel(ar ? "نوع المحتوى" : "Content type", { exact: true }).selectOption("STORY");
        await page.getByRole("button", { name: ar ? "تحرير الوسائط" : "Edit media", exact: true }).click();
        await page.getByRole("button", { name: ar ? "مكتبة الوسائط" : "Media Library", exact: true }).click();
        const library = page.getByRole("dialog", { name: ar ? "مكتبة الوسائط" : "Media Library", exact: true });
        await library.getByRole("button", { name: /^choice.jpg/ }).click();
        state.attachConflict = asset("other-tab");
        await library.getByRole("button", { name: ar ? "إرفاق الملف" : "Attach selected", exact: true }).click();
        await library
          .getByRole("alert")
          .filter({ hasText: ar ? "يستخدم هذا التنسيق ملف وسائط واحداً." : "This format uses one media file." })
          .waitFor();
        await expect.poll(() => library.getByRole("button", { name: /^other-tab.jpg/ }).count()).toBe(1);
        expect(await library.getByRole("button", { name: /^choice.jpg/ }).isDisabled()).toBe(true);
        expect(await library.getByRole("button", { name: ar ? "إرفاق الملف" : "Attach selected", exact: true }).isDisabled()).toBe(true);
        expect(
          await library
            .getByText(
              ar
                ? "يستخدم هذا التنسيق ملف وسائط واحداً. أزل الملف الحالي قبل إضافة آخر."
                : "This format uses one media file. Remove the current file before adding another.",
              { exact: true }
            )
            .count()
        ).toBe(1);
        expect(await library.getByText(ar ? "اختر ملفاً ثم أرفقه." : "Choose a file, then attach it.", { exact: false }).count()).toBe(0);
        await assertPlexFonts(page, [".studio-dialog h2", ".studio-dialog [role=alert]"]);
        await page.screenshot({ path: `evidence/create-media-conflict-${locale}-${ar ? "dark" : "light"}.png`, fullPage: true });
        await library.getByRole("button", { name: ar ? "إغلاق" : "Close", exact: true }).click();
        expect(await page.getByLabel(ar ? "نوع المحتوى" : "Content type", { exact: true }).inputValue()).toBe("STORY");
        await page.getByRole("button", { name: ar ? "تحرير النص" : "Edit caption", exact: true }).click();
        expect(await page.getByLabel(ar ? "نص المنشور" : "Caption", { exact: true }).inputValue()).toBe("Keep my chosen caption.");
        expect(state.items[0]?.revision).toBe(2);
        await page.getByRole("button", { name: ar ? "تحرير الوسائط" : "Edit media", exact: true }).click();
        await page.getByRole("button", { name: `${ar ? "إزالة" : "Remove"} other-tab.jpg`, exact: true }).click();
        await expect.poll(() => page.getByRole("button", { name: ar ? "مكتبة الوسائط" : "Media Library", exact: true }).isEnabled()).toBe(true);
        expect(state.items[0]?.mediaIds).toEqual([]);
      } finally {
        await close();
      }
    }
  });

  it("refreshes a failed video job's retained output and current attachments without replacing unsaved copy or its baseline", async () => {
    const { page, state, close } = await setup([draft({ contentType: "REEL", mediaIds: [] })], []);
    state.jobStatus = "GENERATING";
    try {
      await open(page, "saved-post");
      await edit(page, "Keep this unsaved caption through attachment failure.");
      state.media.push(videoAsset("other-tab"), { ...videoAsset("retained-video"), type: "AI_GENERATED" });
      state.items[0]!.mediaIds = ["other-tab"];
      state.jobStatus = "FAILED";
      state.jobOutputId = "retained-video";
      state.jobErrorCode = "CONTENT_MEDIA_SINGLE_ITEM_LIMIT";
      await page.getByRole("button", { name: "View saved media", exact: true }).waitFor();
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Keep this unsaved caption through attachment failure.");
      expect(await page.getByRole("button", { name: "Save", exact: true }).isEnabled()).toBe(true);
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      await page.getByRole("button", { name: "Remove other-tab.mp4", exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Media Library", exact: true }).isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Retry video", exact: true }).count()).toBe(0);
      const saveRequest = page.waitForRequest((request) => request.method() === "PATCH" && request.url().endsWith("/v1/content/saved-post"));
      await page.getByRole("button", { name: "Remove other-tab.mp4", exact: true }).click();
      expect((await saveRequest).postDataJSON().expectedRevision).toBe(1);
      await expect.poll(() => state.items[0]?.mediaIds.length).toBe(0);
      await page.getByRole("button", { name: "View saved media", exact: true }).click();
      const library = page.getByRole("dialog", { name: "Media Library", exact: true });
      await library.getByLabel("Media type", { exact: true }).selectOption("VIDEO");
      await library.getByRole("button", { name: /^retained-video.mp4/ }).click();
      await library.getByRole("button", { name: "Attach selected", exact: true }).click();
      await library.waitFor({ state: "hidden" });
      expect(state.items[0]?.caption).toBe("Keep this unsaved caption through attachment failure.");
      expect(state.items[0]?.mediaIds).toEqual(["retained-video"]);
      expect(state.calls.some((call) => call.includes("generate-video") || call.includes("retry"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("starts with an editable local draft and no preview, then browses media without attaching on selection", async () => {
    const { page, state, close } = await setup([], [asset(), asset("square", 1080, 1080)]);
    try {
      await page.goto(`${baseUrl}/en/app/content-studio`, { waitUntil: "networkidle" });
      await expect.poll(() => page.getByLabel("Caption", { exact: true }).isEnabled()).toBe(true);
      expect(await page.getByRole("group", { name: "Choose a content type", exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "View preview", exact: true }).count()).toBe(0);
      expect(await page.locator(".studio-instagram").count()).toBe(0);
      await page.getByLabel("Caption", { exact: true }).fill("A manual draft before choosing its format.");
      expect(state.creates).toBe(0);
      await page.getByRole("button", { name: "Carousel", exact: true }).click();
      expect(await page.getByLabel("Content type", { exact: true }).inputValue()).toBe("CAROUSEL");
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      const opener = page.getByRole("button", { name: "Media Library", exact: true });
      await opener.click();
      const library = page.getByRole("dialog", { name: "Media Library", exact: true });
      expect(await library.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await library.getByRole("searchbox", { name: "Search media", exact: true }).fill("missing");
      await library.getByText("No media matches your search.", { exact: true }).waitFor();
      await library.getByRole("searchbox", { name: "Search media", exact: true }).fill("square");
      const selected = library.getByRole("button", { name: /^square.jpg/ });
      await selected.click();
      expect(await library.getByRole("button", { name: "Attach selected", exact: true }).isEnabled()).toBe(true);
      expect(state.calls).toEqual([]);
      state.failSave = true;
      await library.getByRole("button", { name: "Attach selected", exact: true }).click();
      await library.getByRole("alert").filter({ hasText: "Please retry this action." }).waitFor();
      expect(await selected.getAttribute("aria-pressed")).toBe("true");
      expect(state.creates).toBe(0);
      state.failSave = false;
      await library.getByRole("button", { name: "Close", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      expect(await library.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await library.waitFor({ state: "hidden" });
      expect(await opener.evaluate((element) => element === document.activeElement)).toBe(true);
      await page.getByRole("button", { name: "Edit caption", exact: true }).click();
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("A manual draft before choosing its format.");
      expect(state.creates).toBe(0);
    } finally {
      await close();
    }
  });
  it("reconnects to an in-progress conversation after refresh without sending again", async () => {
    const { page, state, close } = await setup([draft()]);
    let release = () => {};
    state.aiHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await open(page, "saved-post");
      expect(await page.getByRole("region", { name: "MARKOS assistant", exact: true }).isVisible()).toBe(true);
      expect(await page.locator(".studio-instagram").count()).toBe(0);
      expect(await page.getByRole("button", { name: "View preview", exact: true }).locator("img").count()).toBe(1);
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Make the caption shorter.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      const working = page.getByRole("status", { name: "MARKOS is working", exact: true });
      await working.waitFor();
      expect((await working.innerText()).trim()).toBe("");
      expect(await working.locator("svg").count()).toBe(1);
      await preview(page);
      expect(await working.isVisible()).toBe(true);
      expect(await page.getByLabel("Caption", { exact: true }).isDisabled()).toBe(true);
      await page.reload();
      await assistant(page);
      await page.getByText("Make the caption shorter.", { exact: true }).waitFor();
      await working.waitFor();
      const leave = page.getByRole("button", { name: "Leave", exact: true });
      expect(await leave.isEnabled()).toBe(true);
      await leave.focus();
      release();
      await page.getByText("The caption is updated and saved.", { exact: true }).waitFor();
      await working.waitFor({ state: "detached" });
      expect(await leave.evaluate((element) => document.activeElement === element)).toBe(true);
      expect(await page.locator(".studio-instagram").count()).toBe(0);
      expect(state.calls).toEqual(["POST /v1/content/saved-post/conversation"]);
      expect(state.items[0]?.caption).toContain("Shorter citrus caption.");
    } finally {
      release();
      await close();
    }
  });
  it("saves one complete caption, previews the exact text, and preserves it across English and Arabic", async () => {
    const { page, state, close } = await setup([draft()]);
    const caption =
      "  Orange and cardamom, baked for your next coffee.\n\n" +
      "A little sweetness to share. ".repeat(4) +
      "\n\nبرتقال وهيل مع قهوتك القادمة.\n\nMessage us. راسلنا.\n\n#SnackLab #البحرين\n";
    try {
      await open(page, "saved-post");
      await edit(page, caption);
      expect(await page.getByLabel("Caption language", { exact: true }).count()).toBe(0);
      expect(await page.getByLabel("Hashtags", { exact: true }).count()).toBe(0);
      expect(await page.getByLabel("Call to action", { exact: true }).count()).toBe(0);
      expect(await page.getByLabel("Caption", { exact: true }).evaluate((element) => getComputedStyle(element).unicodeBidi)).toBe("plaintext");
      await preview(page);
      await page.getByRole("button", { name: "more", exact: true }).click();
      expect(await page.getByTestId("preview-caption").textContent()).toBe(caption);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Draft saved.", { exact: true }).waitFor();
      expect(state.items[0]?.caption).toBe(caption);
      await open(page, "saved-post", "ar");
      await preview(page, "ar");
      await page.getByRole("button", { name: "المزيد", exact: true }).click();
      expect(await page.getByTestId("preview-caption").textContent()).toBe(caption);
      await page.getByRole("button", { name: "تحرير النص", exact: true }).click();
      expect(await page.getByLabel("نص المنشور", { exact: true }).inputValue()).toBe(caption);
      await page.screenshot({ path: "evidence/create-unified-caption-rtl.png" });
      await open(page, "saved-post");
      await edit(page, "a".repeat(2201));
      const callsBefore = state.calls.length;
      expect(await page.getByLabel("Caption", { exact: true }).getAttribute("aria-invalid")).toBe("true");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.locator(".studio-feedback-error").waitFor();
      expect(state.calls.length).toBe(callsBefore);
      expect(state.items[0]?.caption).toBe(caption);
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toHaveLength(2201);
    } finally {
      await close();
    }
  });

  it("generates a complete caption beside the permanent manual editor", async () => {
    const { page, state, close } = await setup();
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await open(page);
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Introduce orange and cardamom in English then Arabic.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".studio-conversation-log")?.textContent?.includes("updated and saved"));
      expect(state.calls).toEqual(["POST /v1/content", "POST /v1/content/new-1/conversation"]);
      expect(state.items[0]?.caption).toBe("Shorter citrus caption.\n\nنص عربي محدّث.\n\nTry it today");
      const chat = await page.locator(".studio-conversation").boundingBox();
      const output = await page.locator(".studio-editor").boundingBox();
      expect(output!.width).toBeGreaterThan(chat!.width);
      expect(await page.getByLabel("Caption", { exact: true }).isVisible()).toBe(true);
      await page.screenshot({ path: "evidence/create-wide-conversation.png" });
    } finally {
      await close();
    }
  });

  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("keeps new work local, recovers failed saves, and saves before opening a new draft", async () => {
    const { page, state, close } = await setup();
    try {
      await open(page);
      expect(state.creates).toBe(0);
      await edit(page, "My unsaved introduction.");
      await page.getByRole("button", { name: "New", exact: true }).click();
      const gate = page.getByRole("dialog", { name: "Save changes before leaving?" });
      await gate.waitFor();
      state.failSave = true;
      await gate.getByRole("button", { name: "Save and leave", exact: true }).click();
      await gate.getByRole("alert").waitFor();
      expect(await page.locator(".studio-inspector textarea").first().inputValue()).toBe("My unsaved introduction.");
      expect(state.creates).toBe(0);
      await page.screenshot({ path: "evidence/create-save-recovery.png" });
      state.failSave = false;
      await gate.getByRole("button", { name: "Save and leave", exact: true }).click();
      await gate.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "How can MARKOS help?" }).waitFor();
      expect(state.creates).toBe(1);
      expect(state.items[0]?.caption).toBe("My unsaved introduction.");
      expect(new URL(page.url()).searchParams.has("item")).toBe(false);
      expect(state.calls.some((call) => call.includes("/generate"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("protects Leave, app navigation, and refresh; discard preserves the saved record", async () => {
    const { page, state, close } = await setup([draft()]);
    try {
      await open(page, "saved-post");
      await edit(page, "This change will be discarded.");
      await page.getByRole("button", { name: "Leave", exact: true }).click();
      const gate = page.getByRole("dialog", { name: "Save changes before leaving?" });
      await gate.waitFor();
      await page.keyboard.press("Escape");
      await gate.waitFor({ state: "hidden" });
      await page.getByRole("link", { name: "Campaigns", exact: true }).first().click();
      await gate.waitFor();
      await page.keyboard.press("Escape");
      let unloadType = "";
      page.once("dialog", async (dialog) => {
        unloadType = dialog.type();
        await dialog.dismiss();
      });
      await page.reload({ timeout: 2000 }).catch(() => undefined);
      expect(unloadType).toBe("beforeunload");
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("This change will be discarded.");
      await page.getByRole("button", { name: "New", exact: true }).click();
      await gate.getByRole("button", { name: "Discard changes", exact: true }).click();
      await gate.waitFor({ state: "hidden" });
      expect(state.items[0]?.caption).toBe(draft().caption);
      expect(state.calls).toEqual([]);
    } finally {
      await close();
    }
  });

  it("protects same-document browser Back while a draft has unsaved changes", async () => {
    const { page, state, close } = await setup();
    try {
      await page.goto(`${baseUrl}/en/app/campaigns`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Close campaign composer" }).click();
      await page.getByRole("link", { name: "Create", exact: true }).click();
      await page.getByRole("button", { name: "Edit caption", exact: true }).click();
      await page.getByLabel("Caption", { exact: true }).fill("Do not lose this on Back.");
      await page.goBack({ timeout: 2000 }).catch(() => undefined);
      const gate = page.getByRole("dialog", { name: "Save changes before leaving?" });
      await gate.waitFor();
      await page.keyboard.press("Escape");
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Do not lose this on Back.");
      expect(state.creates).toBe(0);
    } finally {
      await close();
    }
  });

  it("revises the same manual Campaign draft, saving edits first and locking competing actions", async () => {
    const { page, state, close } = await setup([draft({ campaignId: "campaign-launch" })]);
    try {
      await open(page, "saved-post");
      await assistant(page);
      await page.getByRole("heading", { name: "Let’s bring this idea to life." }).waitFor();
      await edit(page, "Keep our exact product facts.");
      let release = () => {};
      state.aiHold = new Promise<void>((resolve) => {
        release = resolve;
      });
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Introduce our orange-cardamom knot.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      await page.getByRole("status", { name: "MARKOS is working", exact: true }).waitFor();
      expect(await page.getByLabel("Caption", { exact: true }).isDisabled()).toBe(true);
      await expect.poll(() => state.calls.length).toBe(2);
      expect(state.items[0]?.caption).toBe("Keep our exact product facts.");
      release();
      await expect.poll(async () => page.getByLabel("Caption", { exact: true }).inputValue(), { timeout: 8000 }).toContain("Shorter citrus");
      await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>(".studio-composer textarea")?.value === "");
      expect(state.calls).toEqual(["PATCH /v1/content/saved-post", "POST /v1/content/saved-post/conversation"]);
      expect(state.creates).toBe(0);
      expect(state.items[0]?.campaignId).toBe("campaign-launch");
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Shorter citrus caption.\n\nنص عربي محدّث.\n\nTry it today");
      state.aiHold = null;
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Make it shorter.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>(".studio-composer textarea")?.value === "");
      expect(state.calls.at(-1)).toBe("POST /v1/content/saved-post/conversation");
      await expect.poll(async () => page.getByLabel("Message MARKOS", { exact: true }).isEnabled()).toBe(true);
      await page.screenshot({ path: "evidence/create-conversation-desktop.png" });
      state.failAi = true;
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Make it warmer.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      await page.getByRole("region", { name: "Create workspace" }).getByRole("alert").waitFor();
      expect(state.items[0]?.caption).toBe("Shorter citrus caption.\n\nنص عربي محدّث.\n\nTry it today");
      expect(await page.getByLabel("Message MARKOS", { exact: true }).inputValue()).toBe("Make it warmer.");
    } finally {
      await close();
    }
  });

  it("uploads to the same saved draft and attaches library media for a carousel", async () => {
    const { page, state, close } = await setup();
    try {
      await open(page);
      await edit(page, "Two views of our new offering.");
      await page.getByLabel("Content type", { exact: true }).selectOption("CAROUSEL");
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      const bytes = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1350;
        const paint = canvas.getContext("2d")!;
        paint.fillStyle = "#eec7a4";
        paint.fillRect(0, 0, 1080, 1350);
        return canvas.toDataURL("image/jpeg").split(",")[1]!;
      });
      await page
        .getByLabel("Upload JPEG file", { exact: true })
        .setInputFiles({ name: "upload.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes, "base64") });
      await page.getByText("Media attached. The draft is saved.", { exact: true }).waitFor();
      expect(await page.getByRole("region", { name: "MARKOS assistant", exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "View preview", exact: true }).locator("img").count()).toBe(1);
      expect(await page.locator(".studio-instagram").count()).toBe(0);
      expect(state.creates).toBe(1);
      expect(await page.getByRole("button", { name: "Mark Ready", exact: true }).isDisabled()).toBe(true);
      await page.getByRole("button", { name: "Media Library", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Media Library" })
        .getByRole("button", { name: /^photo.jpg/ })
        .click();
      expect(state.items[0]?.mediaIds).toEqual(["upload"]);
      await page.getByRole("dialog", { name: "Media Library" }).getByRole("button", { name: "Attach selected", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      expect(state.creates).toBe(1);
      expect(state.items[0]?.mediaIds).toEqual(["upload", "photo"]);
      expect(await page.getByRole("region", { name: "MARKOS assistant", exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "Mark Ready", exact: true }).isEnabled()).toBe(true);
    } finally {
      await close();
    }
  });

  it("discusses options without editing, remembers them across refresh, and keeps media generation explicit", async () => {
    const { page, state, close } = await setup([draft()]);
    try {
      await open(page, "saved-post");
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Explore two launch options.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      await page.getByText("Here are two directions to consider.", { exact: true }).waitFor();
      expect(state.items[0]?.caption).toBe(draft().caption);
      await page.reload();
      await assistant(page);
      await page.getByText("Explore two launch options.", { exact: true }).waitFor();
      await page.getByText("Here are two directions to consider.", { exact: true }).waitFor();
      expect(await page.getByLabel("AI action", { exact: true }).count()).toBe(0);
      await assistant(page);
      await page.getByLabel("Message MARKOS", { exact: true }).fill("Use the second option.");
      await page.getByRole("button", { name: "Send to MARKOS", exact: true }).click();
      await page.getByText("The caption is updated and saved.", { exact: true }).waitFor();
      expect(state.calls.every((call) => !call.includes("generate-image"))).toBe(true);
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      await page.getByRole("button", { name: "Remove photo.jpg", exact: true }).click();
      await expect.poll(() => state.items[0]?.mediaIds.length).toBe(0);
      await page.getByText("Generate media", { exact: true }).click();
      await expect.poll(async () => page.getByLabel("Visual direction", { exact: true }).inputValue()).toContain("orange slices");
      await page.getByRole("button", { name: "Generate image", exact: true }).click();
      await page.getByText("Image generated and attached. The draft is saved.", { exact: true }).waitFor();
      expect(state.calls.at(-1)).toBe("POST /v1/content/saved-post/generate-image");
      expect(state.items[0]?.mediaIds).toContain("generated");
      expect(await page.getByRole("region", { name: "MARKOS assistant", exact: true }).isVisible()).toBe(true);
      expect(await page.locator(".studio-instagram").count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("saves readiness changes, returns Ready to Draft, and schedules in Bahrain time", async () => {
    const { page, state, close } = await setup([draft()]);
    try {
      await open(page, "saved-post");
      await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
      await page.getByRole("button", { name: "Return to Draft", exact: true }).click();
      await page.getByRole("button", { name: "Mark Ready", exact: true }).waitFor();
      expect(state.items[0]?.status).toBe("DRAFT");
      await page.reload();
      await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
      await page.getByRole("button", { name: "Schedule / publish", exact: true }).click();
      await page.getByLabel("Publish date and time", { exact: true }).fill("2027-01-05T12:30");
      await page.getByRole("button", { name: "Confirm schedule", exact: true }).click();
      await page.getByRole("button", { name: "Cancel schedule", exact: true }).click();
      expect(state.items[0]?.scheduledAt).toBe("2027-01-05T09:30:00.000Z");
      await page.getByRole("dialog", { name: "Cancel this schedule?" }).getByRole("button", { name: "Cancel schedule", exact: true }).click();
      await page.getByRole("button", { name: "Return to Draft", exact: true }).waitFor();
      expect(state.items[0]?.status).toBe("APPROVED");
    } finally {
      await close();
    }
  });

  it("dismisses routine notices without shifting the preview and keeps errors available", async () => {
    const { page, state, close } = await setup([draft()]);
    try {
      await open(page, "saved-post");
      await preview(page);
      const before = await page.locator(".studio-instagram").boundingBox();
      await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
      const feedback = page.locator(".studio-feedback");
      await feedback.waitFor();
      const after = await page.locator(".studio-instagram").boundingBox();
      expect(after).toEqual(before);
      expect(await feedback.evaluate((node) => getComputedStyle(node).position)).toBe("fixed");
      await feedback.waitFor({ state: "hidden", timeout: 7000 });
      await page.getByRole("button", { name: "Return to Draft", exact: true }).click();
      await feedback.getByRole("button", { name: "Dismiss notification", exact: true }).click();
      await feedback.waitFor({ state: "hidden" });
      await edit(page, "Recover this after a save failure.");
      state.failSave = true;
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await feedback.waitFor();
      expect(await feedback.getAttribute("role")).toBe("alert");
      // Routine-notice expiry must not also discard an actionable failure.
      await page.waitForTimeout(4700);
      expect(await feedback.isVisible()).toBe(true);
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Recover this after a save failure.");
    } finally {
      await close();
    }
  });

  it("keeps the outer preview ratio across formats, desktop sizes and Arabic", async () => {
    for (const type of ["POST", "CAROUSEL", "REEL", "STORY"] as const) {
      const media = type === "REEL" ? [videoAsset()] : type === "CAROUSEL" ? [asset(), asset("square", 1080, 1080)] : [asset()];
      const { page, close } = await setup([draft({ contentType: type, mediaIds: media.map((file) => file.id) })], media);
      try {
        await open(page, "saved-post");
        await preview(page);
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 1366, height: 768 },
          { width: 1920, height: 1080 }
        ]) {
          await page.setViewportSize(viewport);
          const box = await page.locator(".studio-instagram").boundingBox();
          expect(box!.width / box!.height).toBeCloseTo(9 / 19, 2);
          expect(box!.width).toBeLessThanOrEqual(342.5);
          expect(box!.height).toBeLessThanOrEqual(722.5);
          expect(box!.width).toBeGreaterThan(viewport.height === 768 ? 190 : 230);
          expect(box!.y + box!.height).toBeLessThan(viewport.height);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect(await page.locator(".studio-instagram-title").count()).toBe(0);
          expect(await page.getByRole("button", { name: "Edit post", exact: true }).count()).toBe(0);
        }
        if (type === "CAROUSEL") {
          await page.getByRole("button", { name: "Next slide", exact: true }).click();
          expect(await page.locator(".studio-slide-count").textContent()).toBe("2/2");
          const box = await page.locator(".studio-instagram-feed-media").boundingBox();
          expect(box!.width / box!.height).toBeCloseTo(1, 2);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({ path: `evidence/create-${type.toLowerCase()}-desktop.png` });
        if (type === "STORY") {
          await open(page, "saved-post", "ar");
          await preview(page, "ar");
          expect(await page.locator("main").getAttribute("dir")).toBe("rtl");
          const box = await page.locator(".studio-instagram").boundingBox();
          expect(box!.width / box!.height).toBeCloseTo(9 / 19, 2);
          await page.screenshot({ path: "evidence/create-story-rtl.png" });
        }
      } finally {
        await close();
      }
    }
  });

  it("retries transient worker polling and attaches completed media without replacing unsaved copy", async () => {
    const { page, state, close } = await setup([draft({ contentType: "REEL", mediaIds: [] })], [videoAsset("video-result")]);
    state.jobStatus = "GENERATING";
    state.pollFailures = 1;
    try {
      await open(page, "saved-post");
      await edit(page, "Keep this unsaved caption through worker updates.");
      await page.getByText("Generating video · 40%", { exact: true }).waitFor();
      expect(await page.getByLabel("Content type", { exact: true }).isDisabled()).toBe(true);
      await page.getByRole("button", { name: "Edit media", exact: true }).click();
      expect(await page.getByRole("button", { name: "Media Library", exact: true }).isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Cancel generation", exact: true }).isEnabled()).toBe(true);
      state.jobStatus = "COMPLETED";
      await page.getByRole("button", { name: "Remove video-result.mp4", exact: true }).waitFor({ timeout: 15000 });
      expect(await page.getByRole("button", { name: "Remove video-result.mp4", exact: true }).isEnabled()).toBe(true);
      expect(await page.getByLabel("Content type", { exact: true }).isEnabled()).toBe(true);
      await page.getByRole("button", { name: "Edit caption", exact: true }).click();
      expect(await page.getByLabel("Caption", { exact: true }).inputValue()).toBe("Keep this unsaved caption through worker updates.");
      expect(await page.getByRole("button", { name: "Save", exact: true }).isEnabled()).toBe(true);
      expect(state.items[0]?.caption).toBe(draft().caption);
    } finally {
      await close();
    }
  });
});
