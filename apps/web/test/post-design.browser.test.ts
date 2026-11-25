import { mkdir, readFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { ContentAuthoringOperation, ContentRecord, PostArtwork, PostArtworkSource, WorkspaceAssistantTurn } from "@markos/shared-types";

const base = process.env.SETTINGS_BROWSER_BASE_URL;
if (!base) throw new Error("SETTINGS_BROWSER_BASE_URL required");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
});
afterAll(async () => {
  await browser?.close();
});

it.each([
  { locale: "en", theme: "light", width: 1440 },
  { locale: "ar", theme: "dark", width: 1366 }
] as const)(
  "finishes and edits the photo-based design from Home ($locale)",
  async ({ locale, theme, width }) => {
    const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce", acceptDownloads: true });
    const photo = await readFile("../mobile/assets/post-style-soft.jpg");
    let turn: WorkspaceAssistantTurn | undefined;
    const renders: (PostArtwork & { source?: PostArtworkSource })[] = [];
    let uploaded = 0;
    let scheduled: unknown;
    let publishNowCalls = 0;
    const now = new Date().toISOString();
    const session = {
      tokens: { accessToken: "fixture", expiresIn: 900 },
      user: { id: "owner", email: "owner@pearl.test", fullName: "Owner", isVerified: true, locale },
      workspace: { id: "workspace", name: "Pearl Bakery", slug: "pearl" },
      roles: ["OWNER"]
    };
    const id = "970278b8-866a-48fb-9e87-bb361a34db4a";
    const slot: ContentRecord["mediaItems"][number] = {
      id: "music-free-image",
      position: 0,
      workspaceId: session.workspace.id,
      contentItemId: id,
      mediaKind: "IMAGE",
      mediaAssetId: null,
      purpose: null,
      title: null,
      body: null,
      visualDirection: null,
      aspectRatio: null,
      generationDurationSeconds: null,
      createdAt: now,
      updatedAt: now
    };
    const item: ContentRecord = {
      id,
      workspaceId: session.workspace.id,
      contentType: "POST",
      status: "DRAFT",
      caption: "",
      mediaItems: [slot],
      revision: 0,
      reelScript: null,
      createdAt: now,
      updatedAt: now
    };
    const connection = { connected: true, accountId: "instagram-fixture", username: "fixture_bakery" };
    await page.addInitScript(
      ({ session, theme }) => {
        localStorage.setItem("markos.session", JSON.stringify(session));
        localStorage.setItem("markos.theme", theme);
      },
      { session, theme }
    );
    const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    await page.route("**/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/v1/auth/refresh") return route.fulfill(json(session));
      if (path === "/v1/onboarding")
        return route.fulfill(
          json({ status: "COMPLETE", businessProfile: { status: "APPROVED" }, modules: [], onboardingScore: 100, vaultScore: { score: 100 } })
        );
      if (path === "/v1/assistant/chats")
        return route.fulfill(
          json({
            items: turn ? [{ id: turn.chatId, title: "Bakery hours", legacy: false, createdAt: now, updatedAt: now }] : [],
            nextCursor: null
          })
        );
      if (/^\/v1\/assistant\/chats\/[^/]+\/messages$/.test(path)) return route.fulfill(json({ turns: turn ? [turn] : [], nextBefore: null }));
      if (path === "/v1/assistant/post-designs") {
        const body = route.request().postDataJSON();
        turn = {
          id: body.requestId,
          chatId: body.chatId,
          message: body.message,
          reply: "",
          status: "COMPLETED",
          proposal: null,
          postDesign: true,
          contentItemId: id,
          createdAt: now
        };
        return route.fulfill(json(turn));
      }
      if (path === `/v1/content/${id}`) return route.fulfill(json(item));
      if (path === "/v1/content/ideate") return route.fulfill(json({ caption: "Pearl Bakery\n8 am to 10 pm" }));
      if (path === "/v1/media/post-artwork") {
        renders.push(route.request().postDataJSON());
        return route.fulfill(json({ base64Data: photo.toString("base64") }));
      }
      if (path === "/v1/media/upload") return route.fulfill(json({ id: `asset-${++uploaded}` }));
      if (path === `/v1/content/${id}/mutate`) {
        const body = route.request().postDataJSON() as { expectedRevision: number; operations: ContentAuthoringOperation[] };
        if (body.expectedRevision !== item.revision) return route.fulfill({ status: 409 });
        for (const operation of body.operations) {
          if (operation.type === "updateContent" && operation.fields.caption !== undefined) item.caption = operation.fields.caption;
          if (operation.type === "updateMediaItem") Object.assign(slot, operation.fields);
        }
        item.revision++;
        return route.fulfill(json(item));
      }
      if (path === `/v1/content/${id}/status`) {
        item.status = route.request().postDataJSON().status;
        item.revision++;
        return route.fulfill(json(item));
      }
      if (path === `/v1/workspace/publish-readiness/${id}`) return route.fulfill(json({ ready: true, connection, reasons: [], contentItem: item }));
      if (path === "/v1/publishing/live-readiness") return route.fulfill(json({ mode: "live", ready: true, reasons: [], connection }));
      if (path === `/v1/content/${id}/schedule`) {
        scheduled = route.request().postDataJSON();
        item.status = "SCHEDULED";
        item.scheduledAt = route.request().postDataJSON().scheduledAt;
        return route.fulfill(json(item));
      }
      if (path.includes("/publish-now")) publishNowCalls++;
      return route.fulfill(json(null));
    });

    try {
      const screens = "../../var/first-flow-desktop/screens";
      await mkdir(screens, { recursive: true });
      const button = (name: string) => page.getByRole("button", { name, exact: true });
      await page.goto(`${base}/${locale}/app`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: t("Your business is ready", "نشاطك التجاري جاهز") }).waitFor();
      await page.screenshot({ path: `${screens}/home-${locale}.png` });
      await button(t("Post ideas", "أفكار منشورات")).click();
      await button(t("Opening hours", "ساعات العمل")).click();
      await page.locator('input[type="file"]').setInputFiles({ name: "bakery.jpg", mimeType: "image/jpeg", buffer: photo });
      await page.locator("#home-message").fill(t("Design a post: Opening hours, 8 am to 10 pm", "صمّم منشوراً: ساعات العمل من ٨ إلى ١٠"));
      await button(t("Send message", "إرسال الرسالة")).click();
      await button(t("Hybrid", "هجين")).click();
      await button(t("Confirm style", "تأكيد النمط")).click();
      await button(t("Hello Bold", "مرحباً عريض")).click();
      await button(t("Confirm font", "تأكيد الخط")).click();
      await button(t("4:5 Portrait", "4:5 عمودي")).click();
      await page.screenshot({ path: `${screens}/format-${locale}.png` });
      await button(t("Generate preview", "إنشاء المعاينة")).click();
      const open = button(t("Open full post preview", "فتح المعاينة الكاملة للمنشور"));
      await open.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: t("Post preview", "معاينة المنشور") }).waitFor();
      expect((await dialog.boundingBox())!.width).toBeGreaterThan(960);
      await page.keyboard.press("Escape");
      expect(await open.evaluate((el) => el === document.activeElement)).toBe(true);
      await button(t("Edit", "تعديل")).click();
      await page.getByLabel(t("Headline on image", "العنوان على الصورة")).fill("Pearl · أهلاً");
      await page.screenshot({ path: `${screens}/editor-${locale}.png` });
      await button(t("Save edits", "حفظ التعديلات")).click();
      await dialog.waitFor({ state: "hidden" });
      expect(renders).toHaveLength(2);
      expect(renders[0]?.source).toEqual({ photoBase64: photo.toString("base64") });
      expect(renders[1]).toMatchObject({ title: "Pearl · أهلاً", source: renders[0]?.source, ratio: "4:5", style: "hybrid" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await open.waitFor();
      const downloading = page.waitForEvent("download");
      await page.getByRole("link", { name: t("Download", "تنزيل") }).click();
      expect((await downloading).suggestedFilename()).toBe("markos-post.jpg");
      if (locale === "en") {
        for (const ratio of ["3:4", "4:5"]) {
          await button("Edit").click();
          await button("Resize").click();
          await page.getByLabel("Post shape").selectOption(ratio);
          await button("Save edits").click();
          await dialog.waitFor({ state: "hidden" });
          expect(renders.at(-1)).toMatchObject({ ratio, source: renders[0]?.source });
          if (ratio === "3:4") {
            expect(slot.mediaAssetId).toBeNull();
            expect(await button("Mark ready").count()).toBe(0);
          }
        }
      }
      await button(t("Mark ready", "اعتماد المنشور")).click();
      await button(t("Publish with MARKOS", "النشر عبر ماركوس")).click();
      await dialog.getByText(t("Instagram account: @fixture_bakery", "حساب إنستغرام: @fixture_bakery")).waitFor();
      const reviewed = item.revision;
      await button(t("Cancel", "إلغاء")).click();
      expect(publishNowCalls).toBe(0);
      await button(t("Schedule", "جدولة")).click();
      await dialog.getByText(t("Instagram account: @fixture_bakery", "حساب إنستغرام: @fixture_bakery")).waitFor();
      expect(scheduled).toBeUndefined();
      await dialog.locator('input[type="datetime-local"]').fill("2099-12-31T14:30");
      await button(t("Confirm schedule", "تأكيد الجدولة")).click();
      await dialog.waitFor({ state: "hidden" });
      expect(scheduled).toEqual({ expectedRevision: reviewed, scheduledAt: "2099-12-31T11:30:00.000Z" });
      expect(publishNowCalls).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await page.close();
    }
  },
  90000
);
