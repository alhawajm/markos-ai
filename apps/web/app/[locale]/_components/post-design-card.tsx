"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Download, Maximize2, Pencil, Share2 } from "lucide-react";
import {
  canPublishPostRatio,
  postFonts,
  postOverlayCopy,
  postRatios,
  postStyles,
  postTemplates,
  recommendPostTemplates,
  wantsPostIdeas,
  type ContentAuthoringOperation,
  type ContentRecord,
  type Locale,
  type PostArtwork,
  type WorkspaceAssistantTurn
} from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import { PostDesignEditor, type TranslatePost } from "./post-design-editor";
import { postJpeg, readPostDesign, readPostPhoto, savePostDesign, type DesktopPostDesign } from "./post-design-storage";
import { TaskFeedback } from "./task-feedback";
import { useModalDialog } from "./use-modal-dialog";

/* Browser-local previews use object URLs. */
/* eslint-disable @next/next/no-img-element */

const ignoredScheduleReasons = new Set(["CONTENT_NOT_SCHEDULED", "SCHEDULE_TIME_NOT_IN_FUTURE"]);
const ratios = { "1:1": ["Square", "مربّع"], "4:5": ["Portrait", "عمودي"], "3:4": ["Tall", "طويل"] } as const;
const styles = { editorial: ["Editorial", "تحريري"], soft: ["Soft edit", "ناعم"], hybrid: ["Hybrid", "هجين"] } as const;
const fonts = { regular: ["Regular", "عادي"], bold: ["Bold", "عريض"], compact: ["Compact", "مضغوط"] } as const;
const usesSystemShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function";
type PostDestination = { id: string; label: string };

export function usePostImage(photo: Blob | undefined) {
  const [state, setState] = useState<{ photo: Blob; url: string }>();
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setState({ photo, url });
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  return state?.photo === photo ? state?.url : undefined;
}

export function ChatPostDesign({
  turn,
  id,
  storageKey,
  locale,
  t
}: {
  turn: WorkspaceAssistantTurn;
  id: string;
  storageKey: string;
  locale: Locale;
  t: TranslatePost;
}) {
  const api = useMarkosClient(locale);
  const [design, setDesign] = useState<DesktopPostDesign>({ stage: wantsPostIdeas(turn.message) ? "ideas" : "style" });
  const [item, setItem] = useState<ContentRecord>();
  const [asset, setAsset] = useState<{ id: string; url: string; blob?: Blob }>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"preview" | "edit" | "publish" | "schedule" | null>(null);
  const locked = useRef(false);
  const attached = item?.mediaItems[0]?.mediaAssetId ?? null;
  const editable = item?.status === "DRAFT" || item?.status === "IN_REVIEW";
  const localPreview = design.attachedId === attached ? design.preview : undefined;
  const previewUrl = usePostImage(localPreview);
  const sourceUrl = usePostImage(design.photo);
  const finished = design.stage === "preview" || (!design.style && !design.photo && !design.generatedPhoto);
  const currentAsset = asset?.id === attached ? asset : undefined;
  const src = finished ? (previewUrl ?? currentAsset?.url) : undefined;

  useEffect(() => {
    let current = true;
    Promise.all([readPostDesign(storageKey), api.contentItem(id)])
      .then(([savedDesign, savedItem]) => {
        if (!current) return;
        if (savedDesign) setDesign(savedDesign);
        setItem(savedItem);
        setLoaded(true);
      })
      .catch(() => {
        if (current) setError(t("Couldn’t load this post. Reopen the chat to try again.", "تعذّر تحميل المنشور. أعد فتح المحادثة للمحاولة."));
      });
    return () => {
      current = false;
    };
  }, [api, id, storageKey, t]);

  useEffect(() => {
    if (!attached || localPreview || !finished) return;
    const controller = new AbortController();
    void api
      .mediaAsset(attached)
      .then(async (media) => {
        if (!media.publicUrl || controller.signal.aborted) return;
        setAsset({ id: attached, url: media.publicUrl });
        if (!usesSystemShare()) return;
        const response = await fetch(media.publicUrl, { signal: controller.signal });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!controller.signal.aborted) setAsset({ id: attached, url: media.publicUrl, blob });
      })
      .catch(() => {
        // A cross-origin asset can still be viewed and downloaded at its original URL.
      });
    return () => controller.abort();
  }, [api, attached, finished, localPreview]);

  useEffect(() => {
    if (item?.status !== "SCHEDULED") return;
    let current = true;
    const timer = setInterval(() => {
      if (!document.hidden)
        void api
          .contentItem(id)
          .then((saved) => {
            if (current) setItem(saved);
          })
          .catch(() => {});
    }, 4000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [api, id, item?.status]);

  async function remember(next: DesktopPostDesign) {
    await savePostDesign(storageKey, next);
    setDesign(next);
  }
  async function work(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : t("Couldn’t finish. Please try again.", "تعذّر إكمال العملية. حاول مجدداً."));
      void api
        .contentItem(id)
        .then(setItem)
        .catch(() => {});
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  const change = (next: DesktopPostDesign) => void work("", () => remember(next));

  async function render(artwork: PostArtwork, caption: string, base: ContentRecord, next: DesktopPostDesign) {
    const slot = base.mediaItems[0];
    if (!slot) throw new Error(t("The draft’s image slot is missing.", "موضع صورة المسودة غير موجود."));
    const source = next.photo ? { photoBase64: await readPostPhoto(next.photo) } : next.generatedPhoto ? { mediaAssetId: next.generatedPhoto } : undefined;
    const jpeg = await api.renderPostArtwork({ ...artwork, ...(source ? { source } : {}) });
    const preview = postJpeg(jpeg.base64Data);
    const uploaded = canPublishPostRatio(artwork.ratio)
      ? await api.uploadMedia({
          type: "IMAGE",
          filename: "markos-post.jpg",
          mimeType: "image/jpeg",
          base64Data: jpeg.base64Data
        })
      : null;
    const operations: ContentAuthoringOperation[] = [];
    if (caption !== base.caption) operations.push({ type: "updateContent", fields: { caption } });
    if (uploaded || slot.mediaAssetId)
      operations.push({
        type: "updateMediaItem",
        itemId: slot.id,
        fields: { mediaAssetId: uploaded?.id ?? null, aspectRatio: uploaded ? (artwork.ratio === "1:1" ? "SQUARE" : "PORTRAIT") : null }
      });
    const saved = operations.length ? await api.mutateContent(id, { expectedRevision: base.revision, operations }) : base;
    setItem(saved);
    await remember({ ...next, stage: "preview", artwork, ratio: artwork.ratio, preview, attachedId: uploaded?.id ?? null });
  }

  function generate() {
    if (!editable || !item || !design.style || !design.font || !design.ratio) return;
    const { style, font, ratio } = design;
    void work(t("Preparing your preview", "نُعدّ معاينة منشورك"), async () => {
      let base = item;
      let next = design;
      const recipe = postTemplates.find(({ id: templateId, en, ar }) =>
        design.template ? templateId === design.template : turn.message.toLowerCase().includes(en.toLowerCase()) || turn.message.includes(ar)
      )?.recipe;
      const topic = [
        turn.message.slice(0, 640),
        recipe,
        t(
          "First caption line: short artwork headline. Second line: exact supporting facts if known. Do not invent prices, times or dates.",
          "اكتب عنواناً قصيراً في سطر مستقل، ثم التفاصيل المؤكدة فقط في سطر ثانٍ إن وُجدت. لا تختلق أسعاراً أو مواعيد."
        )
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1000);
      const draft = base.caption
        ? { caption: base.caption, visualDirection: base.mediaItems[0]?.visualDirection }
        : await api.ideateContent({ topic, contentType: "POST" });
      const slot = base.mediaItems[0];
      if (!next.photo && !next.generatedPhoto && draft.visualDirection && slot) {
        if (!slot.mediaAssetId) {
          base = await api.mutateContent(id, {
            expectedRevision: base.revision,
            operations: [
              {
                type: "updateMediaItem",
                itemId: slot.id,
                fields: { visualDirection: `Photographic background only, no letters or text. ${draft.visualDirection}`.slice(0, 900) }
              }
            ]
          });
          setItem(base);
          await api.generateContentImage(id, { expectedRevision: base.revision, contentMediaItemId: slot.id });
        }
        base = await api.contentItem(id);
        const generatedPhoto = base.mediaItems[0]?.mediaAssetId;
        if (generatedPhoto) {
          next = { ...next, generatedPhoto };
          await remember(next);
        }
      }
      await render({ ...postOverlayCopy(draft.caption), style, font, ratio, strokes: [], zoom: 1 }, draft.caption, base, next);
    });
  }

  function share() {
    const blob = localPreview ?? currentAsset?.blob;
    if (blob && usesSystemShare()) {
      const files = [new File([blob], "markos-post.jpg", { type: "image/jpeg" })];
      if (navigator.canShare({ files })) {
        void navigator.share({ files, title: t("Share post", "مشاركة المنشور") }).catch((problem) => {
          if (problem instanceof Error && problem.name === "AbortError") return;
          setError(t("Sharing wasn’t available. Use Download to save the image.", "المشاركة غير متاحة. استخدم التنزيل لحفظ الصورة."));
        });
      }
    }
  }
  const file = localPreview ?? currentAsset?.blob;
  const canShareFile = !!file && usesSystemShare() && navigator.canShare({ files: [new File([file], "markos-post.jpg", { type: "image/jpeg" })] });
  const hasLayers = !!design.artwork && design.attachedId === attached;
  const publishable = !!attached && (canPublishPostRatio(design.artwork?.ratio) || !hasLayers);

  if (!loaded || !item)
    return error ? (
      <p role="alert" className="workspace-chat-error">
        {error}
      </p>
    ) : (
      <TaskFeedback label={t("Opening your design", "نفتح تصميمك")} locale={locale} />
    );

  return (
    <div className="post-chat-result" dir={locale === "ar" ? "rtl" : "ltr"}>
      {sourceUrl && !src ? <img className="post-chat-source" src={sourceUrl} alt={design.photoName ?? t("Reference photo", "الصورة المرجعية")} /> : null}
      {src ? (
        <article className="post-chat-preview">
          <button className="post-preview-open" aria-label={t("Open full post preview", "فتح المعاينة الكاملة للمنشور")} onClick={() => setModal("preview")}>
            <img src={src} alt={t("Post artwork", "تصميم المنشور")} />
            <span aria-hidden>
              <Maximize2 size={17} />
            </span>
          </button>
          <p>{t("Your post is ready to review.", "منشورك جاهز للمراجعة.")}</p>
          {item.caption ? (
            <details className="post-preview-caption">
              <summary>{t("Instagram caption", "وصف إنستغرام")}</summary>
              <p dir="auto">{item.caption}</p>
            </details>
          ) : null}
          <div className="post-inline-actions">
            {editable && hasLayers ? (
              <button disabled={!!busy} onClick={() => setModal("edit")}>
                <Pencil size={16} />
                {t("Edit", "تعديل")}
              </button>
            ) : null}
            {canShareFile ? (
              <button onClick={share}>
                <Share2 size={16} />
                {t("Share", "مشاركة")}
              </button>
            ) : null}
            <a href={src} download="markos-post.jpg" target={src.startsWith("blob:") ? undefined : "_blank"} rel="noreferrer">
              <Download size={16} />
              {t("Download", "تنزيل")}
            </a>
          </div>
          {!publishable ? (
            <small>
              {t(
                "3:4 is available for manual sharing. Use 4:5 or 1:1 to publish with MARKOS.",
                "المقاس ٣:٤ للمشاركة اليدوية. استخدم ٤:٥ أو ١:١ للنشر عبر ماركوس."
              )}
            </small>
          ) : null}
          {publishable && editable ? (
            <button
              className="post-design-primary"
              disabled={!!busy || !item.caption.trim()}
              onClick={() =>
                void work(t("Saving your approval", "نحفظ موافقتك"), async () => setItem(await api.updateContentStatus(id, "APPROVED", item.revision)))
              }
            >
              <Check size={17} />
              {t("Mark ready", "اعتماد المنشور")}
            </button>
          ) : null}
          {publishable && item.status === "APPROVED" ? (
            <div className="post-inline-actions">
              <button
                className="post-design-primary"
                disabled={!!busy}
                onClick={() => {
                  setError("");
                  setModal("publish");
                }}
              >
                {t("Publish with MARKOS", "النشر عبر ماركوس")}
              </button>
              <button
                disabled={!!busy}
                onClick={() => {
                  setError("");
                  setModal("schedule");
                }}
              >
                <CalendarDays size={16} />
                {t("Schedule", "جدولة")}
              </button>
            </div>
          ) : null}
          {item.status === "APPROVED" && hasLayers ? (
            <button
              className="post-design-link"
              disabled={!!busy}
              onClick={() =>
                void work(t("Reopening your draft", "نُعيد فتح المسودة"), async () => {
                  setItem(await api.updateContentStatus(id, "DRAFT", item.revision));
                  setModal("edit");
                })
              }
            >
              {t("Return to draft to edit", "العودة إلى المسودة للتعديل")}
            </button>
          ) : null}
          {item.status === "SCHEDULED" ? (
            <p>
              {item.scheduledAt
                ? t("Scheduled", "مجدول") + " · " + formatPostTime(item.scheduledAt, locale)
                : t("Queued for publishing", "في قائمة انتظار النشر")}
            </p>
          ) : null}
          {item.status === "PUBLISHED" ? <p>{t("Published on Instagram", "تم النشر على إنستغرام")}</p> : null}
          {item.status === "FAILED" ? <p role="alert">{t("Instagram couldn’t publish this post.", "تعذّر النشر على إنستغرام.")}</p> : null}
          <a className="post-design-link" href={`/${locale}/app/content-studio?item=${id}`}>
            {t("Open draft in Create", "فتح المسودة في الإنشاء")} <ArrowUpRight size={14} />
          </a>
        </article>
      ) : design.stage === "preview" || !editable || (!!attached && finished) ? (
        <a className="post-design-link" href={`/${locale}/app/content-studio?item=${id}`}>
          {t("Open draft in Create", "فتح المسودة في الإنشاء")} <ArrowUpRight size={14} />
        </a>
      ) : design.stage === "ideas" ? (
        <fieldset className="post-choice-card">
          <legend>{t("Choose a template idea", "اختر فكرة قالب")}</legend>
          <div className="post-choice-grid">
            {recommendPostTemplates(turn.message).map((template) => (
              <button key={template.id} onClick={() => change({ ...design, template: template.id, style: template.style, stage: "style" })}>
                {t(template.en, template.ar)}
              </button>
            ))}
          </div>
          <button className="post-design-link" onClick={() => change({ ...design, stage: "style" })}>
            {t("Choose a style directly", "اختر نمطاً مباشرة")}
          </button>
        </fieldset>
      ) : design.stage === "style" ? (
        <fieldset className="post-choice-card">
          <legend>{t("Which style do you like?", "أي نمط تفضّل؟")}</legend>
          <div className="post-choice-grid">
            {postStyles.map((style) => (
              <button key={style} aria-pressed={design.style === style} onClick={() => change({ ...design, style })}>
                <img src={`/markos-post/post-style-${style}.jpg`} alt="" />
                <span>{t(styles[style][0], styles[style][1])}</span>
              </button>
            ))}
          </div>
          <button className="post-design-primary" disabled={!design.style} onClick={() => change({ ...design, stage: "font" })}>
            {t("Confirm style", "تأكيد النمط")}
          </button>
        </fieldset>
      ) : design.stage === "font" ? (
        <fieldset className="post-choice-card">
          <legend>{t("Which font do you prefer?", "أي خط تفضّل؟")}</legend>
          <div className="post-choice-grid">
            {postFonts.map((font) => (
              <button key={font} aria-pressed={design.font === font} onClick={() => change({ ...design, font })}>
                <span className={`post-font-sample post-font-${font}`}>{t("Hello", "مرحباً")}</span>
                <span>{t(fonts[font][0], fonts[font][1])}</span>
              </button>
            ))}
          </div>
          <div className="post-inline-actions">
            <button className="post-design-primary" disabled={!design.font} onClick={() => change({ ...design, stage: "ratio" })}>
              {t("Confirm font", "تأكيد الخط")}
            </button>
            <button onClick={() => change({ ...design, stage: "style" })}>{t("Back", "رجوع")}</button>
          </div>
        </fieldset>
      ) : (
        <fieldset className="post-choice-card" disabled={!!busy}>
          <legend>{t("Choose a format for your post", "اختر تنسيق المنشور")}</legend>
          <div className="post-choice-grid">
            {postRatios.map((ratio) => (
              <button key={ratio} aria-pressed={design.ratio === ratio} onClick={() => change({ ...design, ratio })}>
                <span className="post-format-icon" data-ratio={ratio} />
                <strong>{ratio}</strong>
                <span>{t(ratios[ratio][0], ratios[ratio][1])}</span>
              </button>
            ))}
          </div>
          <small>{t("4:5 is recommended for feed posts.", "ننصح بنسبة ٤:٥ لمنشورات الخلاصة.")}</small>
          <div className="post-inline-actions">
            <button className="post-design-primary" disabled={!design.ratio || !!busy} onClick={generate}>
              {t("Generate preview", "إنشاء المعاينة")}
            </button>
            <button onClick={() => change({ ...design, stage: "font" })}>{t("Back", "رجوع")}</button>
          </div>
        </fieldset>
      )}
      {busy ? <TaskFeedback label={busy} locale={locale} /> : null}
      {error && modal !== "edit" ? (
        <p role="alert" className="workspace-chat-error">
          {error}
        </p>
      ) : null}
      {src && (modal === "preview" || modal === "edit") ? (
        <PostDesignEditor
          key={modal}
          src={src}
          caption={item.caption}
          {...(modal === "edit" && design.artwork ? { artwork: design.artwork } : {})}
          busy={!!busy}
          error={error}
          close={() => {
            setError("");
            setModal(null);
          }}
          t={t}
          save={(artwork, caption) =>
            void work(t("Applying your edits", "نُطبّق تعديلاتك"), async () => {
              await render(artwork, caption, item, design);
              setModal(null);
            })
          }
        />
      ) : null}
      {modal === "publish" || modal === "schedule" ? (
        <PostPublish mode={modal} item={item} locale={locale} t={t} close={() => setModal(null)} saved={setItem} />
      ) : null}
    </div>
  );
}

function formatPostTime(value: string, locale: Locale) {
  return new Date(value).toLocaleString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium", timeStyle: "short" });
}

function PostPublish({
  mode,
  item,
  locale,
  t,
  close,
  saved
}: {
  mode: "publish" | "schedule";
  item: ContentRecord;
  locale: Locale;
  t: TranslatePost;
  close: () => void;
  saved: (item: ContentRecord) => void;
}) {
  const api = useMarkosClient(locale);
  const [at, setAt] = useState("");
  const [target, setTarget] = useState<PostDestination>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose: close, closeDisabled: submitting });
  const scheduled = mode === "schedule";
  const date = at ? new Date(`${at}+03:00`) : null;
  const destination = useCallback(async (): Promise<PostDestination> => {
    const [readiness, live] = await Promise.all([api.publishReadiness(item.id), api.publishingLiveReadiness()]);
    const { accountId, username, connected } = readiness.connection;
    if (!connected || !accountId || !username || !live.connection.connected || live.connection.accountId !== accountId)
      throw new Error(t("Connect your Instagram professional account first.", "اربط حساب إنستغرام الاحترافي أولاً."));
    if (readiness.contentItem?.revision !== item.revision || readiness.contentItem?.status !== "APPROVED")
      throw new Error(t("This draft changed. Reopen it and review it again.", "تغيّرت المسودة. أعد فتحها وراجعها من جديد."));
    const valid = readiness.ready || (readiness.reasons.length > 0 && readiness.reasons.every((reason) => ignoredScheduleReasons.has(reason)));
    if (live.mode !== "live" || !live.ready || !valid)
      throw new Error(
        t(
          "Instagram publishing isn’t available for this post. Check the connection and publishing settings.",
          "النشر على إنستغرام غير متاح لهذا المنشور. تحقّق من الربط وإعدادات النشر."
        )
      );
    return { id: accountId, label: `@${username}` };
  }, [api, item.id, item.revision, t]);
  useEffect(() => {
    let mounted = true;
    void destination()
      .then((verified) => {
        if (mounted) setTarget(verified);
      })
      .catch((problem) => {
        if (mounted)
          setError(problem instanceof Error ? problem.message : t("Couldn’t check Instagram publishing. Try again.", "تعذّر التحقّق من النشر. حاول مجدداً."));
      });
    return () => {
      mounted = false;
    };
  }, [destination, t]);

  async function confirm() {
    if (locked.current || !target) return;
    if (scheduled && (!date || !(date.getTime() > Date.now()))) {
      setError(t("Choose a future time in Bahrain.", "اختر وقتاً مستقبلياً بتوقيت البحرين."));
      return;
    }
    locked.current = true;
    setSubmitting(true);
    setError("");
    try {
      if ((await destination()).id !== target.id) {
        setTarget(undefined);
        throw new Error(
          t("The Instagram account changed. Reopen this dialog to review the destination.", "تغيّر حساب إنستغرام. أعد فتح النافذة لمراجعة الوجهة.")
        );
      }
      if (scheduled && date) saved(await api.scheduleContent(item.id, date.toISOString(), item.revision));
      if (!scheduled) {
        await api.publishContentNow(item.id, item.revision);
        saved(await api.contentItem(item.id));
      }
      close();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t("Couldn’t confirm publishing. Reopen this dialog to check the latest status.", "تعذّر تأكيد النشر. أعد فتح النافذة للتحقّق من الحالة.")
      );
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={onCancel} onKeyDown={onKeyDown} className="post-publish-dialog" aria-labelledby="post-publish-title">
      <h2 id="post-publish-title">{scheduled ? t("Schedule post", "جدولة المنشور") : t("Publish now?", "النشر الآن؟")}</h2>
      {target ? (
        <p>{t(`Instagram account: ${target.label}`, `حساب إنستغرام: ${target.label}`)}</p>
      ) : !error ? (
        <p role="status">{t("Checking Instagram…", "نتحقّق من إنستغرام…")}</p>
      ) : null}
      {scheduled ? (
        <label>
          {t("Publish time in Bahrain", "وقت النشر في البحرين")}
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="workspace-chat-error">
          {error}
        </p>
      ) : null}
      <div className="post-inline-actions">
        <button className="post-design-primary" disabled={!target || submitting || (scheduled && !date)} onClick={() => void confirm()}>
          {submitting ? t("Saving…", "جارٍ الحفظ…") : scheduled ? t("Confirm schedule", "تأكيد الجدولة") : t("Confirm publish", "تأكيد النشر")}
        </button>
        <button disabled={submitting} onClick={close}>
          {t("Cancel", "إلغاء")}
        </button>
      </div>
    </dialog>
  );
}
