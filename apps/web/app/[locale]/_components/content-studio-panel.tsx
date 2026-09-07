"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Check,
  FolderOpen,
  SlidersHorizontal,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { captionCharacterCount, captionValidationIssue, CONTENT_CAPTION_MAX_LENGTH } from "@markos/shared-types";
import type {
  ContentConversationRecord,
  ConversationTurnInput,
  ContentRecord,
  ContentType,
  Locale,
  MediaAssetRecord,
  MediaGenerationJobRecord,
  PublishJobRecord
} from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import {
  bahrainInputValue,
  contentDraftFieldsFromRecord,
  contentDraftHasMeaningfulWork,
  contentDraftIsDirty,
  contentDraftPayload,
  emptyContentDraftFields,
  plannedAtInputToIso,
  type ContentDraftFields
} from "./content-studio-draft-state";
import { ContentStudioPreview } from "./content-studio-preview";
import "./content-studio.css";

type ExitIntent = { kind: "new" } | { kind: "navigate"; href: string };
type DialogKind = "library" | "saved" | "schedule" | "delete" | "unschedule" | null;
const types: ContentType[] = ["POST", "CAROUSEL", "REEL", "STORY"];
const activeVideo = (job: MediaGenerationJobRecord | null) => !!job && ["QUEUED", "STARTING", "GENERATING", "PROCESSING"].includes(job.status);
const activePublish = (job: PublishJobRecord | null) => !!job && ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status);

export function ContentStudioPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const ar = locale === "ar";
  const text = (en: string, arabic: string) => (ar ? arabic : en);
  const [fields, setFields] = useState<ContentDraftFields>(emptyContentDraftFields);
  const [baseline, setBaseline] = useState<ContentDraftFields>(emptyContentDraftFields);
  const [record, setRecord] = useState<ContentRecord | null>(null);
  const recordRef = useRef<ContentRecord | null>(null);
  const baselineRevision = useRef(1);
  const conversationEpoch = useRef(0);
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const operationRef = useRef(false);
  const mounted = useRef(true);
  const loadedWorkspace = useRef<string | null>(null);
  const [editing, setEditing] = useState<"caption" | "media" | "details" | null>(null);
  const [prompt, setPrompt] = useState("");
  const [conversation, setConversation] = useState<ContentConversationRecord | null>(null);
  const [conversationError, setConversationError] = useState("");
  const pendingSend = useRef<{ contentItemId: string; input: ConversationTurnInput } | null>(null);
  const turns = useMemo(() => conversation?.messages ?? [], [conversation]);
  const activeConversation = !!conversation?.latestRun && ["QUEUED", "RUNNING"].includes(conversation.latestRun.status);
  const visualDirection = fields.visualDirection;
  const fieldsRef = useRef(fields);
  const baselineRef = useRef(baseline);
  useLayoutEffect(() => {
    fieldsRef.current = fields;
    baselineRef.current = baseline;
  }, [fields, baseline]);
  const [ratio, setRatio] = useState<"1:1" | "4:5" | "9:16">("4:5");
  const [mediaMode, setMediaMode] = useState<"image" | "video">("image");
  const [duration, setDuration] = useState<4 | 8 | 12>(8);
  const [videoJob, setVideoJob] = useState<MediaGenerationJobRecord | null>(null);
  const [publishJob, setPublishJob] = useState<PublishJobRecord | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pendingExit, setPendingExit] = useState<ExitIntent | null>(null);
  const allowExit = useRef(false);
  const [scheduledInput, setScheduledInput] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const dirty = contentDraftIsDirty(fields, baseline);
  const canEdit = !loading && !loadError && (!record || ["DRAFT", "IN_REVIEW"].includes(record.status));
  const disabled = !!busy || loading || !!loadError || activeConversation || (!!record && !conversation && !conversationError);
  const attached = record?.mediaIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is MediaAssetRecord => !!asset) ?? [];
  const caption = fields.caption;
  const captionIssue = captionValidationIssue(caption);
  const captionError =
    captionIssue === "length"
      ? text("Keep the complete caption within 2,200 characters.", "اجعل النص الكامل ضمن ٢٢٠٠ حرف.")
      : captionIssue === "hashtags"
        ? text("Use 30 hashtags or fewer in the complete caption.", "استخدم ٣٠ وسماً أو أقل في النص الكامل.")
        : "";
  const canMarkReady =
    canEdit &&
    !!fields.caption.trim() &&
    !captionIssue &&
    !!record?.mediaIds.length &&
    (fields.contentType !== "CAROUSEL" || record.mediaIds.length >= 2) &&
    !activeVideo(videoJob);

  function field<K extends keyof ContentDraftFields>(key: K, value: ContentDraftFields[K]) {
    if (!canEdit || operationRef.current || activeConversation) return;
    setFields((current) => ({ ...current, [key]: value }));
  }
  function remember(next: ContentRecord) {
    if (!mounted.current) return;
    recordRef.current = next;
    baselineRevision.current = next.revision;
    setRecord(next);
    setRecords((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    const savedFields = contentDraftFieldsFromRecord(next);
    setFields(savedFields);
    setBaseline(savedFields);
    const url = new URL(window.location.href);
    url.searchParams.set("item", next.id);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const workspaceId = session?.workspace.id;
    if (!workspaceId || loadedWorkspace.current === `${workspaceId}:${loadAttempt}`) return;
    loadedWorkspace.current = `${workspaceId}:${loadAttempt}`;
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("item");
    void Promise.all([client.contentItems(), client.mediaAssets()])
      .then(([items, media]) => {
        if (!mounted.current) return;
        setRecords(items);
        setAssets(media);
        const requested = requestedId ? items.find((item) => item.id === requestedId) : undefined;
        if (requested) {
          remember(requested);
          setMediaMode(requested.contentType === "REEL" ? "video" : "image");
        } else if (requestedId) {
          setLoadError(ar ? "لم نعثر على هذا المنشور في مساحة العمل." : "This post was not found in this workspace.");
        } else {
          const queryType = params.get("type")?.toUpperCase();
          const initial = emptyContentDraftFields(types.find((type) => type === queryType) ?? "POST");
          setFields(initial);
          setBaseline(initial);
        }
      })
      .catch((cause: unknown) => {
        if (mounted.current) setLoadError(errorText(cause, locale));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, [client, session?.workspace.id, loadAttempt, ar, locale]);

  useEffect(() => {
    const id = record?.id;
    setConversation(null);
    setConversationError("");
    if (!id) return;
    let cancelled = false;
    let polling = false;
    const refresh = async () => {
      if (polling || operationRef.current) return;
      const epoch = conversationEpoch.current;
      polling = true;
      try {
        const next = await client.contentConversation(id);
        if (cancelled || recordRef.current?.id !== id || epoch !== conversationEpoch.current) return;
        setConversation(next);
        setConversationError("");
        // Never replace unsaved manual fields or advance their revision baseline.
        if (!operationRef.current && !contentDraftIsDirty(fieldsRef.current, baselineRef.current) && next.contentItem.revision !== recordRef.current.revision) {
          remember(next.contentItem);
        }
      } catch (cause) {
        if (!cancelled) setConversationError(errorText(cause, locale));
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, record?.id, locale]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "instant" });
  }, [turns, busy]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const id = record?.id;
    if (!id) {
      setVideoJob(null);
      setPublishJob(null);
      return;
    }
    let cancelled = false;
    void Promise.all([client.latestMediaGenerationJob(id), client.latestPublishJob(id)])
      .then(([video, publish]) => {
        if (!cancelled) {
          setVideoJob((current) => (current?.contentItemId === id ? current : video));
          setPublishJob((current) => (current?.contentItemId === id ? current : publish));
        }
      })
      .catch(() => {
        /* The saved draft remains usable if optional job history is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, [client, record?.id]);

  useEffect(() => {
    if (!activeVideo(videoJob) && !activePublish(publishJob)) return;
    let cancelled = false;
    const id = record?.id;
    let polling = false;
    const timer = window.setInterval(() => {
      if (polling || operationRef.current) return;
      polling = true;
      void Promise.all([videoJob ? client.mediaGenerationJob(videoJob.id) : Promise.resolve(null), id ? client.latestPublishJob(id) : Promise.resolve(null)])
        .then(async ([video, publish]) => {
          if (cancelled) return;
          if (
            (videoJob?.status !== video?.status && video?.status === "COMPLETED") ||
            (publishJob?.status !== publish?.status && publish && ["PUBLISHED", "FAILED"].includes(publish.status))
          ) {
            const [items, media] = await Promise.all([client.contentItems(), client.mediaAssets()]);
            if (cancelled || recordRef.current?.id !== id) return;
            setRecords(items);
            setAssets(media);
            const updated = items.find((item) => item.id === id);
            // A worker changes media/status, never the owner's unsaved copy or its baseline.
            if (updated) {
              recordRef.current = updated;
              setRecord(updated);
            }
          }
          if (!cancelled) {
            setVideoJob(video);
            setPublishJob(publish);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(errorText(cause, locale));
        })
        .finally(() => {
          polling = false;
        });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, record?.id, videoJob, publishJob, locale]);

  useEffect(() => {
    if (!dirty && !busy) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (allowExit.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function intercept(event: MouseEvent) {
      if (allowExit.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      if (operationRef.current) {
        setNotice(ar ? "انتظر اكتمال العملية قبل المغادرة." : "Wait for the current action to finish before leaving.");
      } else setPendingExit({ kind: "navigate", href: destination.href });
    }
    // Modern browsers allow cancellation of same-origin history traversal. Hard
    // navigations and reloads retain the browser's native beforeunload protection.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    function interceptHistory(event: Event) {
      const navigate = event as Event & { navigationType?: string; destination?: { url: string } };
      if (allowExit.current || !navigate.cancelable || navigate.navigationType !== "traverse" || !navigate.destination) return;
      navigate.preventDefault();
      if (operationRef.current) setNotice(ar ? "انتظر اكتمال العملية قبل المغادرة." : "Wait for the current action to finish before leaving.");
      else setPendingExit({ kind: "navigate", href: navigate.destination.url });
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", intercept, true);
    navigation?.addEventListener("navigate", interceptHistory);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", intercept, true);
      navigation?.removeEventListener("navigate", interceptHistory);
    };
  }, [dirty, busy, ar]);

  async function run(label: string, action: () => Promise<void>) {
    if (operationRef.current || loading || loadError) return;
    operationRef.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(errorText(cause, locale));
    } finally {
      operationRef.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function persist(allowEmpty = false): Promise<ContentRecord> {
    if (!session || !canEdit) throw new Error(text("This post cannot be edited in its current state.", "لا يمكن تعديل المنشور في حالته الحالية."));
    if (captionError) throw new Error(captionError);
    const previous = recordRef.current;
    if (previous && !dirty) return previous;
    if (!previous && !allowEmpty && !contentDraftHasMeaningfulWork(fields)) throw new Error(text("Add some content before saving.", "أضف محتوى قبل الحفظ."));
    const payload = contentDraftPayload(fields);
    const saved = previous
      ? await client.updateContent(previous.id, { ...payload, expectedRevision: baselineRevision.current })
      : await client.createContent(payload);
    if (mounted.current) remember(saved);
    return saved;
  }
  function finishExit(intent: ExitIntent) {
    if (!mounted.current) return;
    setPendingExit(null);
    if (intent.kind === "navigate") {
      allowExit.current = true;
      window.location.assign(intent.href);
      return;
    }
    const empty = emptyContentDraftFields();
    recordRef.current = null;
    setRecord(null);
    setFields(empty);
    setBaseline(empty);
    setConversation(null);
    pendingSend.current = null;
    setPrompt("");
    setEditing(null);
    setVideoJob(null);
    setPublishJob(null);
    setError("");
    setNotice("");
    setMediaMode("image");
    setRatio("4:5");
    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    url.searchParams.delete("type");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function requestExit(intent: ExitIntent) {
    if (operationRef.current) return;
    if (dirty) setPendingExit(intent);
    else finishExit(intent);
  }
  async function send() {
    const message = prompt.trim();
    if (!message || disabled || conversationError) return;
    conversationEpoch.current += 1;
    await run(text("Sending…", "جارٍ الإرسال…"), async () => {
      const saved = canEdit ? await persist(true) : recordRef.current;
      if (!saved) return;
      const previous = pendingSend.current;
      const input =
        previous?.contentItemId === saved.id && previous.input.message === message
          ? previous.input
          : { requestId: crypto.randomUUID(), expectedRevision: saved.revision, message, locale };
      pendingSend.current = { contentItemId: saved.id, input };
      const next = await client.sendConversationMessage(saved.id, input);
      if (!mounted.current || recordRef.current?.id !== saved.id) return;
      setConversation(next);
      remember(next.contentItem);
      pendingSend.current = null;
      setPrompt("");
    });
  }
  async function upload(file: File) {
    if (!canEdit) return;
    await run(text("Uploading media…", "جارٍ رفع الوسائط…"), async () => {
      if (file.type !== "image/jpeg" || !/\.jpe?g$/i.test(file.name) || !file.size || file.size > 8 * 1024 * 1024) {
        throw new Error(
          text(
            "Choose a JPEG up to 8 MB. Existing videos can be selected from the Media Library.",
            "اختر صورة JPEG حتى 8 ميغابايت. يمكنك اختيار فيديو محفوظ من مكتبة الوسائط."
          )
        );
      }
      const dimensions = await readImageDimensions(file);
      const saved = await persist(true);
      const media = await client.uploadMedia({ filename: file.name, mimeType: file.type, type: "IMAGE", ...dimensions, base64Data: await readBase64(file) });
      setAssets((current) => [media, ...current.filter((item) => item.id !== media.id)]);
      const result = await client.attachMediaToContent(saved.id, media.id);
      remember(result);
      setNotice(text("Media attached. The draft is saved.", "أُرفقت الوسائط وحُفظت المسودة."));
    });
  }
  async function attach(asset: MediaAssetRecord) {
    await run(text("Attaching media…", "جارٍ إرفاق الوسائط…"), async () => {
      const saved = await persist(true);
      remember(await client.attachMediaToContent(saved.id, asset.id));
      setDialog(null);
      setNotice(text("Media attached. The draft is saved.", "أُرفقت الوسائط وحُفظت المسودة."));
    });
  }
  async function generateMedia() {
    await run(text("Starting media generation…", "جارٍ بدء إنشاء الوسائط…"), async () => {
      const saved = await persist(true);
      if (mediaMode === "video") {
        if (visualDirection.trim().length < 3) throw new Error(text("Describe the video before generating it.", "صف الفيديو قبل إنشائه."));
        setVideoJob(await client.generateContentVideo(saved.id, { aspectRatio: "9:16", durationSeconds: duration, prompt: visualDirection.trim() }));
        setNotice(text("Video generation started. The job is saved with this post.", "بدأ إنشاء الفيديو وحُفظت المهمة مع المنشور."));
      } else {
        const result = await client.generateContentImage(saved.id, {
          aspectRatio: fields.contentType === "STORY" ? "9:16" : ratio,
          ...(visualDirection.trim() ? { prompt: visualDirection.trim() } : {})
        });
        setAssets((current) => [result.mediaAsset, ...current.filter((item) => item.id !== result.mediaAsset.id)]);
        remember(result.contentItem);
        setNotice(text("Image generated and attached. The draft is saved.", "أُنشئت الصورة وأُرفقت وحُفظت المسودة."));
      }
    });
  }
  async function markReady() {
    if (!canMarkReady) return;
    await run(text("Marking Ready…", "جارٍ تحديد الجاهزية…"), async () => {
      let saved = await persist();
      if (saved.status === "DRAFT") {
        saved = await client.updateContentStatus(saved.id, "IN_REVIEW", saved.revision);
        remember(saved);
      }
      remember(await client.updateContentStatus(saved.id, "APPROVED", saved.revision));
      setEditing(null);
      setNotice(text("Ready. Choose when to publish, or return to Draft to edit.", "جاهز. اختر وقت النشر أو أعده إلى مسودة للتعديل."));
    });
  }
  function openSchedule() {
    const suggested = record?.scheduledAt ?? record?.plannedAt ?? new Date(Date.now() + 86400000).toISOString();
    const input = bahrainInputValue(suggested);
    setScheduledInput(`${input.slice(0, 14)}${Number(input.slice(14, 16)) < 30 ? "00" : "30"}`);
    setDialog("schedule");
  }
  const status = record?.status ?? "DRAFT";

  return (
    <section className="studio-workspace" aria-label={text("Create workspace", "مساحة الإنشاء")}>
      <header className="studio-topbar">
        <h1 className="me-2 text-2xl font-bold tracking-tight">{text("Create", "إنشاء")}</h1>
        <span className="max-w-52 truncate text-sm text-[var(--sunlit-muted)]">{fields.brief || text("Untitled post", "منشور بلا عنوان")}</span>
        {record?.campaignId && (
          <a className="text-sm font-medium text-[var(--sunlit-coral-deep)]" href={`/${locale}/app/campaigns?campaign=${record.campaignId}`}>
            {text("Campaign", "الحملة")} ↗
          </a>
        )}
        <span className="rounded-lg bg-[var(--sunlit-paper-deep)] px-2.5 py-1 text-sm font-semibold">{statusText(status, locale)}</span>
        <span role="status" className="text-xs text-[var(--sunlit-muted)]">
          {busy || (dirty ? text("Unsaved changes", "تغييرات غير محفوظة") : record ? text("Saved", "محفوظ") : text("Not saved yet", "لم يُحفظ بعد"))}
        </span>
        <div className="ms-auto flex gap-2">
          <button className="studio-button" disabled={disabled} onClick={() => setDialog("saved")} type="button">
            <FolderOpen size={16} />
            {text("Open", "فتح")}
          </button>
          <button className="studio-button" disabled={disabled} onClick={() => requestExit({ kind: "new" })} type="button">
            <Plus size={16} />
            {text("New", "جديد")}
          </button>
          <button
            className="studio-button"
            disabled={!!busy || loading}
            onClick={() => requestExit({ kind: "navigate", href: `/${locale}/app/${record?.campaignId ? "campaigns" : "calendar"}` })}
            type="button"
          >
            <LogOut size={16} />
            {text("Leave", "مغادرة")}
          </button>
        </div>
      </header>
      {(error || notice || loadError) && (
        <div role={error || loadError ? "alert" : "status"} className={`studio-feedback ${error || loadError ? "studio-feedback-error" : ""}`}>
          {!error && !loadError && <Check aria-hidden="true" size={18} />}
          <span>{loadError || error || notice}</span>
          {loadError && (
            <button className="studio-button" onClick={() => setLoadAttempt((value) => value + 1)} type="button">
              {text("Retry", "إعادة المحاولة")}
            </button>
          )}
          {!loadError && (
            <button
              aria-label={text("Dismiss notification", "إغلاق التنبيه")}
              onClick={() => {
                setNotice("");
                setError("");
              }}
              type="button"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
      <div className="studio-halves">
        <section className="studio-conversation" aria-label={text("MARKOS assistant", "مساعد MARKOS")}>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="text-[var(--sunlit-coral)]" size={19} />
            <strong>MARKOS</strong>
            <span className="ms-auto text-xs text-[var(--sunlit-muted)]">{text("Saved conversation", "محادثة محفوظة")}</span>
          </div>
          <div className="studio-conversation-log" ref={transcriptRef}>
            {loading ? (
              <p className="mt-10 text-[var(--sunlit-muted)]">{text("Opening your workspace…", "جارٍ فتح مساحة العمل…")}</p>
            ) : (
              turns.length === 0 && (
                <div className="my-10 max-w-md">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {record?.campaignId
                      ? text("Let’s bring this idea to life.", "لنحوّل هذه الفكرة إلى محتوى.")
                      : text("What would you like to create?", "ما الذي ترغب في إنشائه؟")}
                  </h2>
                  <p className="mt-3 leading-7 text-[var(--sunlit-muted)]">
                    {record?.campaignId
                      ? fields.brief
                      : text(
                          "Describe an idea, introduce an offering, or use the caption and media controls to add your own content.",
                          "صف فكرة أو قدّم عرضاً أو استخدم أدوات النص والوسائط لإضافة محتواك."
                        )}
                  </p>
                  {canEdit && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {[text("Introduce an offering", "تقديم عرض"), text("Explore a fresh idea", "استكشاف فكرة جديدة")].map((suggestion) => (
                        <button
                          className="studio-button"
                          key={suggestion}
                          disabled={disabled}
                          onClick={() => {
                            setPrompt(suggestion);
                            composerRef.current?.focus();
                          }}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            <div role="log" aria-live="polite" aria-label={text("Conversation", "المحادثة")}>
              {turns.map((turn) => (
                <div key={turn.id} className={`studio-turn studio-turn-${turn.role}`}>
                  {turn.role === "assistant" && <Sparkles className="mt-1 shrink-0 text-[var(--sunlit-coral)]" size={19} />}
                  <p>{turn.text}</p>
                </div>
              ))}
            </div>
            {conversationError && (
              <p role="alert" className="text-red-700">
                {text("Conversation could not be loaded. Reconnecting…", "تعذّر تحميل المحادثة. جارٍ إعادة الاتصال…")}
              </p>
            )}
            {activeConversation && (
              <p role="status" className="my-4 text-[var(--sunlit-muted)]">
                {text("MARKOS is working. You can leave and return to this conversation.", "يعمل MARKOS. يمكنك المغادرة والعودة إلى المحادثة.")}
              </p>
            )}
            {busy && (
              <p className="flex items-center gap-2 text-sm text-[var(--sunlit-muted)]" aria-live="polite">
                <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
                {busy}
              </p>
            )}
          </div>
          <div className="studio-composer">
            <textarea
              ref={composerRef}
              aria-label={text("Message MARKOS", "رسالة إلى MARKOS")}
              disabled={disabled || !!conversationError}
              maxLength={4000}
              rows={2}
              placeholder={text("Tell MARKOS what you want to create or change…", "أخبر MARKOS بما تريد إنشاءه أو تغييره…")}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                className="studio-button border-0 px-1"
                disabled={disabled || !canEdit}
                onClick={() => {
                  setEditing("media");
                  uploadRef.current?.click();
                }}
                aria-label={text("Attach JPEG", "إرفاق JPEG")}
                type="button"
              >
                <Paperclip size={19} />
              </button>
              <button
                className="studio-button studio-button-primary ms-auto"
                aria-label={text("Send to MARKOS", "إرسال إلى MARKOS")}
                disabled={disabled || !!conversationError || !prompt.trim()}
                onClick={() => void send()}
                type="button"
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--sunlit-muted)]">
            {text(
              "Messages are saved. Requested draft edits are saved when MARKOS finishes. Generate images and videos in Media.",
              "تُحفظ الرسائل وتعديلات المسودة المطلوبة عند اكتمال عمل MARKOS. أنشئ الصور والفيديو من الوسائط."
            )}
          </p>
        </section>
        <section className="studio-output" aria-label={text("Post workspace", "مساحة المنشور")}>
          <h2 className="sr-only">{text("Instagram preview", "معاينة Instagram")}</h2>
          <div className="studio-output-stage">
            {editing ? (
              <div className="studio-inspector">
                <header className="studio-editor-header">
                  <h3 className="font-semibold">
                    {editing === "caption"
                      ? text("Edit caption", "تحرير النص")
                      : editing === "media"
                        ? text("Edit media", "تحرير الوسائط")
                        : text("Post details", "تفاصيل المنشور")}
                  </h3>
                  <button className="studio-button" aria-label={text("Close editor", "إغلاق المحرر")} onClick={() => setEditing(null)} type="button">
                    <X size={18} />
                    {text("Done", "تم")}
                  </button>
                </header>
                <fieldset disabled={disabled || !canEdit} className="space-y-5">
                  {editing === "caption" && (
                    <>
                      <label className="studio-field">
                        {text("Caption", "نص المنشور")}
                        <textarea
                          aria-label={text("Caption", "نص المنشور")}
                          aria-describedby="studio-caption-help studio-caption-count"
                          aria-invalid={!!captionIssue}
                          dir="auto"
                          className="studio-caption-text"
                          rows={12}
                          placeholder={text(
                            "Write your complete caption, including any Arabic, English, CTA, and hashtags.",
                            "اكتب النص كاملاً، بما فيه العربية والإنجليزية والدعوة إلى إجراء والوسوم التي تريدها."
                          )}
                          value={caption}
                          onChange={(event) => field("caption", event.target.value)}
                        />
                      </label>
                      <p id="studio-caption-help" className="text-sm text-[var(--sunlit-muted)]">
                        {fields.contentType === "STORY"
                          ? text(
                              "Supporting text stays with this draft. Instagram Stories do not display it as a caption or text overlay.",
                              "يبقى النص مع المسودة. لا يظهر كنص توضيحي أو كتابة فوق القصة على Instagram."
                            )
                          : text(
                              "One caption, in your chosen order. This is the text sent to Instagram.",
                              "نص واحد بالترتيب الذي تختاره. هذا هو النص الذي يُرسل إلى Instagram."
                            )}
                      </p>
                      <p id="studio-caption-count" className={captionIssue ? "text-sm text-[var(--sunlit-danger)]" : "text-sm text-[var(--sunlit-muted)]"}>
                        {captionCharacterCount(caption)} / {CONTENT_CAPTION_MAX_LENGTH}
                        {captionError && <span role="alert"> · {captionError}</span>}
                      </p>
                    </>
                  )}
                  {editing === "media" && (
                    <section aria-label={text("Media", "الوسائط")} className="space-y-3">
                      <h3 className="font-semibold">{text("Media", "الوسائط")}</h3>
                      <p className="text-xs leading-5 text-[var(--sunlit-muted)]">
                        {text(
                          "Adding, removing, or generating media saves the current draft. Uploaded assets remain in your library.",
                          "إضافة الوسائط أو حذفها أو إنشاؤها يحفظ المسودة الحالية. تبقى الملفات المرفوعة في المكتبة."
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button className="studio-button" onClick={() => uploadRef.current?.click()} type="button">
                          <ImagePlus size={16} />
                          {text("Upload JPEG", "رفع JPEG")}
                        </button>
                        <button className="studio-button" onClick={() => setDialog("library")} type="button">
                          {text("Media Library", "مكتبة الوسائط")}
                        </button>
                      </div>
                      {attached.map((asset, index) => (
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--sunlit-line)] p-2" key={asset.id}>
                          <span className="text-xs text-[var(--sunlit-muted)]">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{asset.filename}</span>
                          <button
                            className="studio-button"
                            aria-label={`${text("Remove", "إزالة")} ${asset.filename}`}
                            onClick={() =>
                              void run(text("Removing media…", "جارٍ إزالة الوسائط…"), async () => {
                                const saved = await persist();
                                remember(await client.detachMediaFromContent(saved.id, asset.id));
                              })
                            }
                            type="button"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <details className="rounded-xl border border-[var(--sunlit-line)] p-3">
                        <summary className="cursor-pointer text-sm font-semibold">{text("Generate media", "إنشاء الوسائط")}</summary>
                        <div className="mt-4 space-y-4">
                          {fields.contentType === "STORY" && (
                            <label className="studio-field">
                              {text("Media format", "تنسيق الوسائط")}
                              <select
                                aria-label={text("Media format", "تنسيق الوسائط")}
                                value={mediaMode}
                                onChange={(event) => setMediaMode(event.target.value as "image" | "video")}
                              >
                                <option value="image">{text("Image", "صورة")}</option>
                                <option value="video">{text("Video", "فيديو")}</option>
                              </select>
                            </label>
                          )}
                          <label className="studio-field">
                            {text("Visual direction", "التوجيه البصري")}
                            <textarea
                              aria-label={text("Visual direction", "التوجيه البصري")}
                              rows={3}
                              maxLength={2000}
                              value={visualDirection}
                              onChange={(event) => field("visualDirection", event.target.value)}
                              placeholder={text(
                                "Describe the visual, or leave blank for an image based on the draft.",
                                "صف المشهد أو اتركه فارغاً لإنشاء صورة بناءً على المسودة."
                              )}
                            />
                          </label>
                          {mediaMode === "video" ? (
                            <label className="studio-field">
                              {text("Duration", "المدة")}
                              <select
                                aria-label={text("Duration", "المدة")}
                                value={duration}
                                onChange={(event) => setDuration(Number(event.target.value) as 4 | 8 | 12)}
                              >
                                {[4, 8, 12].map((seconds) => (
                                  <option key={seconds} value={seconds}>
                                    {seconds} {text("seconds", "ثوانٍ")}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            fields.contentType !== "STORY" && (
                              <label className="studio-field">
                                {text("Image ratio", "نسبة الصورة")}
                                <select
                                  aria-label={text("Image ratio", "نسبة الصورة")}
                                  value={ratio}
                                  onChange={(event) => setRatio(event.target.value as typeof ratio)}
                                >
                                  <option value="1:1">1:1</option>
                                  <option value="4:5">4:5</option>
                                </select>
                              </label>
                            )
                          )}
                          <p className="text-xs text-[var(--sunlit-muted)]">
                            {text(
                              "This uses your AI media allowance and saves the generated asset with this post.",
                              "يستهلك هذا رصيد الوسائط ويحفظ الناتج مع المنشور."
                            )}
                          </p>
                          <button
                            className="studio-button"
                            disabled={disabled || activeVideo(videoJob) || (mediaMode === "video" && visualDirection.trim().length < 3)}
                            onClick={() => void generateMedia()}
                            type="button"
                          >
                            <Sparkles size={16} />
                            {mediaMode === "video" ? text("Generate video", "إنشاء فيديو") : text("Generate image", "إنشاء صورة")}
                          </button>
                        </div>
                      </details>
                    </section>
                  )}
                  {editing === "details" && (
                    <section className="space-y-4">
                      {(
                        [
                          ["contentPillar", text("Content pillar", "محور المحتوى")],
                          ["campaignGoal", text("Post objective", "هدف المنشور")],
                          ["tone", text("Tone", "النبرة")]
                        ] as const
                      ).map(([key, label]) => (
                        <label className="studio-field" key={key}>
                          {label}
                          <input
                            aria-label={label}
                            maxLength={key === "tone" ? 200 : 500}
                            value={fields[key]}
                            onChange={(event) => field(key, event.target.value)}
                          />
                        </label>
                      ))}
                      <label className="studio-field">
                        {text("Brief", "الفكرة")}
                        <textarea
                          aria-label={text("Brief", "الفكرة")}
                          rows={3}
                          maxLength={1000}
                          value={fields.brief}
                          onChange={(event) => field("brief", event.target.value)}
                        />
                      </label>
                      <label className="studio-field">
                        {text("Planned publication", "موعد النشر المقترح")}
                        <input
                          aria-label={text("Planned publication", "موعد النشر المقترح")}
                          type="datetime-local"
                          value={fields.plannedAtInput}
                          onChange={(event) => field("plannedAtInput", event.target.value)}
                        />
                      </label>
                      <p className="text-xs text-[var(--sunlit-muted)]">
                        {text("Bahrain time. A planned date does not schedule publication.", "بتوقيت البحرين. الموعد المقترح لا يجدول النشر.")}
                      </p>
                    </section>
                  )}
                </fieldset>
                {editing === "details" && record && !["SCHEDULED", "PUBLISHED"].includes(status) && (
                  <button
                    className="studio-button mt-6 text-[var(--sunlit-danger)]"
                    disabled={disabled || activePublish(publishJob)}
                    onClick={() => setDialog("delete")}
                    type="button"
                  >
                    <Trash2 size={16} />
                    {text("Delete draft", "حذف المسودة")}
                  </button>
                )}
              </div>
            ) : (
              <ContentStudioPreview
                brandName={session?.workspace.name ?? ""}
                caption={caption}
                contentType={fields.contentType}
                locale={locale}
                media={attached}
                fallbackRatio={ratio}
              />
            )}
          </div>
          <aside className="studio-action-rail" aria-label={text("Post controls", "أدوات المنشور")}>
            <label className="studio-field">
              {text("Content type", "نوع المحتوى")}
              <select
                disabled={disabled || !canEdit}
                aria-label={text("Content type", "نوع المحتوى")}
                value={fields.contentType}
                onChange={(event) => {
                  const type = event.target.value as ContentType;
                  field("contentType", type);
                  setMediaMode(type === "REEL" ? "video" : "image");
                  setRatio(type === "STORY" ? "9:16" : "4:5");
                }}
              >
                <option value="POST">{text("Post", "منشور")}</option>
                <option value="CAROUSEL">{text("Carousel", "منشور متعدد")}</option>
                <option value="REEL">{text("Reel", "ريل")}</option>
                <option value="STORY">{text("Story", "قصة")}</option>
              </select>
            </label>

            <div className="studio-edit-actions">
              <button
                className="studio-button"
                aria-label={text("Edit caption", "تحرير النص")}
                aria-pressed={editing === "caption"}
                disabled={disabled}
                onClick={() => setEditing(editing === "caption" ? null : "caption")}
                type="button"
              >
                <Pencil size={18} />
                {text("Caption", "النص")}
              </button>
              <button
                className="studio-button"
                aria-label={text("Edit media", "تحرير الوسائط")}
                aria-pressed={editing === "media"}
                disabled={disabled}
                onClick={() => setEditing(editing === "media" ? null : "media")}
                type="button"
              >
                <ImagePlus size={18} />
                {text("Media", "الوسائط")}
              </button>
              <button
                className="studio-button"
                aria-label={text("Edit post details", "تحرير تفاصيل المنشور")}
                aria-pressed={editing === "details"}
                disabled={disabled}
                onClick={() => setEditing(editing === "details" ? null : "details")}
                type="button"
              >
                <SlidersHorizontal size={18} />
                {text("Details", "التفاصيل")}
              </button>
            </div>
            {videoJob && (activeVideo(videoJob) || videoJob.status === "FAILED") && (
              <div className="mx-4 mb-3 rounded-lg bg-[var(--sunlit-paper-deep)] p-3 text-sm" role="status">
                <p>
                  {activeVideo(videoJob)
                    ? text(
                        `Generating video${videoJob.progress == null ? "…" : ` · ${videoJob.progress}%`}`,
                        `جارٍ إنشاء الفيديو${videoJob.progress == null ? "…" : ` · ${videoJob.progress}%`}`
                      )
                    : videoJob.errorMessage || text("Video generation failed.", "تعذر إنشاء الفيديو.")}
                </p>
                <button
                  className="studio-button mt-2"
                  disabled={disabled || !canEdit}
                  onClick={() =>
                    void run(text("Updating video job…", "جارٍ تحديث مهمة الفيديو…"), async () => {
                      setVideoJob(activeVideo(videoJob) ? await client.cancelMediaGeneration(videoJob.id) : await client.retryMediaGeneration(videoJob.id));
                    })
                  }
                  type="button"
                >
                  {activeVideo(videoJob) ? text("Cancel generation", "إلغاء الإنشاء") : text("Retry video", "إعادة محاولة الفيديو")}
                </button>
              </div>
            )}
            {publishJob && publishJob.status !== "CANCELLED" && (
              <p role="status" className="mx-4 mb-3 text-sm text-[var(--sunlit-muted)]">
                {publishJob.lastErrorMessage ||
                  (publishJob.status === "PUBLISHED"
                    ? text("Published to Instagram", "نُشر على Instagram")
                    : activePublish(publishJob)
                      ? text("Publishing job in progress", "مهمة النشر قيد التنفيذ")
                      : text("Publishing job needs review", "مهمة النشر تحتاج إلى مراجعة"))}
              </p>
            )}
            <footer className="studio-output-footer">
              {loading || loadError ? null : canEdit ? (
                <>
                  <button
                    className="studio-button"
                    disabled={disabled || (!dirty && !!record) || (!record && !contentDraftHasMeaningfulWork(fields))}
                    onClick={() =>
                      void run(text("Saving…", "جارٍ الحفظ…"), async () => {
                        await persist();
                        setNotice(text("Draft saved.", "حُفظت المسودة."));
                      })
                    }
                    type="button"
                  >
                    <Save size={16} />
                    {text("Save", "حفظ")}
                  </button>
                  <button className="studio-button studio-button-primary" disabled={disabled || !canMarkReady} onClick={() => void markReady()} type="button">
                    <Check size={16} />
                    {text("Mark Ready", "تحديد كجاهز")}
                  </button>
                  {!canMarkReady && (
                    <p className="w-full text-xs text-[var(--sunlit-muted)]">
                      {text(
                        fields.contentType === "CAROUSEL"
                          ? "Add a caption and at least two media items before marking Ready."
                          : "Add a caption and media before marking Ready.",
                        fields.contentType === "CAROUSEL" ? "أضف نصاً ووسيطين على الأقل لتحديد الجاهزية." : "أضف نصاً ووسائط لتحديد الجاهزية."
                      )}
                    </p>
                  )}
                </>
              ) : status === "APPROVED" ? (
                <>
                  <button
                    className="studio-button"
                    disabled={disabled || activePublish(publishJob)}
                    onClick={() =>
                      void run(text("Returning to Draft…", "جارٍ الإعادة إلى مسودة…"), async () => {
                        if (!record) return;
                        remember(await client.updateContentStatus(record.id, "DRAFT", record.revision));
                        setNotice(text("This post is a Draft again.", "أصبح المنشور مسودة مجدداً."));
                      })
                    }
                    type="button"
                  >
                    <RotateCcw size={16} />
                    {text("Return to Draft", "إعادة إلى مسودة")}
                  </button>
                  <button className="studio-button studio-button-primary" disabled={disabled || activePublish(publishJob)} onClick={openSchedule} type="button">
                    {text("Schedule / publish", "جدولة / نشر")}
                  </button>
                </>
              ) : status === "SCHEDULED" ? (
                <>
                  <button
                    className="studio-button"
                    disabled={disabled || publishJob?.status === "PROCESSING"}
                    onClick={() => setDialog("unschedule")}
                    type="button"
                  >
                    {text("Cancel schedule", "إلغاء الجدولة")}
                  </button>
                  <button className="studio-button" disabled={disabled || publishJob?.status === "PROCESSING"} onClick={openSchedule} type="button">
                    {text("Reschedule", "إعادة الجدولة")}
                  </button>
                </>
              ) : status === "FAILED" ? (
                <>
                  <p className="text-sm">{record?.failureReason || text("Publishing needs attention.", "النشر يحتاج إلى مراجعة.")}</p>
                  <button className="studio-button" disabled={disabled} onClick={openSchedule} type="button">
                    {text("Reschedule", "إعادة الجدولة")}
                  </button>
                </>
              ) : (
                <p className="text-sm text-[var(--sunlit-muted)]">{text("Published content is read-only.", "المحتوى المنشور للقراءة فقط.")}</p>
              )}
            </footer>
          </aside>
        </section>
      </div>
      <input
        className="hidden"
        ref={uploadRef}
        aria-label={text("Upload JPEG file", "رفع ملف JPEG")}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        disabled={disabled || !canEdit}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {pendingExit && (
        <StudioDialog
          title={text("Save changes before leaving?", "حفظ التغييرات قبل المغادرة؟")}
          busy={!!busy}
          onClose={() => setPendingExit(null)}
          closeLabel={text("Close", "إغلاق")}
        >
          <p className="my-4 text-sm leading-6">
            {text(
              "Discard changes leaves your last saved draft intact. Save and leave keeps your edits before continuing.",
              "تجاهل التغييرات يحتفظ بآخر مسودة محفوظة. الحفظ والمغادرة يحتفظ بتعديلاتك قبل المتابعة."
            )}
          </p>
          {error && (
            <p role="alert" className="my-3 text-sm text-[var(--sunlit-danger)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="studio-button" disabled={!!busy} onClick={() => setPendingExit(null)} type="button">
              {text("Keep editing", "متابعة التحرير")}
            </button>
            <button className="studio-button" disabled={!!busy} onClick={() => finishExit(pendingExit)} type="button">
              {text("Discard changes", "تجاهل التغييرات")}
            </button>
            <button
              className="studio-button studio-button-primary"
              disabled={!!busy}
              onClick={() =>
                void run(text("Saving…", "جارٍ الحفظ…"), async () => {
                  await persist();
                  finishExit(pendingExit);
                })
              }
              type="button"
            >
              {text("Save and leave", "حفظ ومغادرة")}
            </button>
          </div>
        </StudioDialog>
      )}
      {dialog && (
        <StudioDialog
          title={
            dialog === "library"
              ? text("Media Library", "مكتبة الوسائط")
              : dialog === "saved"
                ? text("Open a post", "فتح منشور")
                : dialog === "schedule"
                  ? text("Publishing time", "وقت النشر")
                  : dialog === "delete"
                    ? text("Delete this draft?", "حذف هذه المسودة؟")
                    : text("Cancel this schedule?", "إلغاء هذه الجدولة؟")
          }
          busy={!!busy}
          onClose={() => setDialog(null)}
          closeLabel={text("Close", "إغلاق")}
        >
          {error && (
            <p role="alert" className="mt-4 text-sm text-[var(--sunlit-danger)]">
              {error}
            </p>
          )}
          {dialog === "saved" && (
            <div className="mt-5 space-y-2">
              {records.length === 0 ? (
                <p>{text("No saved posts yet.", "لا توجد منشورات محفوظة بعد.")}</p>
              ) : (
                records.map((item) => (
                  <button
                    className="studio-button w-full justify-between text-start"
                    disabled={!!busy}
                    key={item.id}
                    onClick={() => {
                      setDialog(null);
                      if (item.id !== record?.id) requestExit({ kind: "navigate", href: `/${locale}/app/content-studio?item=${item.id}` });
                    }}
                    type="button"
                  >
                    <span className="truncate">{item.brief || item.caption || text("Untitled post", "منشور بلا عنوان")}</span>
                    <span className="ms-2 shrink-0 text-xs">{statusText(item.status, locale)}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {dialog === "library" && (
            <div className="mt-5 space-y-2">
              {assets.length === 0 ? (
                <p>{text("Upload a JPEG to start your media library.", "ارفع صورة JPEG لبدء مكتبة الوسائط.")}</p>
              ) : (
                assets.map((asset) => (
                  <button
                    className="studio-button w-full justify-between text-start"
                    disabled={!!busy || record?.mediaIds.includes(asset.id)}
                    key={asset.id}
                    onClick={() => void attach(asset)}
                    type="button"
                  >
                    <span className="truncate">{asset.filename}</span>
                    {record?.mediaIds.includes(asset.id) && <Check size={16} />}
                  </button>
                ))
              )}
            </div>
          )}
          {dialog === "schedule" && (
            <div className="mt-5 space-y-4">
              <label className="studio-field">
                {text("Publish date and time", "تاريخ ووقت النشر")}
                <input
                  aria-label={text("Publish date and time", "تاريخ ووقت النشر")}
                  type="datetime-local"
                  step={1800}
                  disabled={!!busy}
                  value={scheduledInput}
                  onChange={(event) => setScheduledInput(event.target.value)}
                />
              </label>
              <p className="text-sm text-[var(--sunlit-muted)]">
                {text(
                  "Bahrain time · half-hour intervals. This action queues the post for publishing.",
                  "بتوقيت البحرين · فواصل نصف ساعة. يضيف هذا الإجراء المنشور إلى قائمة النشر."
                )}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                {status === "APPROVED" && (
                  <button
                    className="studio-button"
                    disabled={!!busy}
                    onClick={() =>
                      void run(text("Queuing publication…", "جارٍ إدراج النشر…"), async () => {
                        if (!record) return;
                        setPublishJob(await client.publishContentNow(record.id));
                        const items = await client.contentItems();
                        const updated = items.find((item) => item.id === record.id);
                        if (updated) remember(updated);
                        setDialog(null);
                        setNotice(text("Queued to publish now.", "أُضيف إلى قائمة النشر الآن."));
                      })
                    }
                    type="button"
                  >
                    {text("Publish now", "نشر الآن")}
                  </button>
                )}
                <button
                  className="studio-button studio-button-primary"
                  disabled={!!busy || !scheduledInput}
                  onClick={() =>
                    void run(text("Saving schedule…", "جارٍ حفظ الجدولة…"), async () => {
                      if (!record) return;
                      const date = plannedAtInputToIso(scheduledInput);
                      if (!date || Number(scheduledInput.slice(14, 16)) % 30 !== 0)
                        throw new Error(text("Choose a time on a half-hour boundary.", "اختر وقتاً بفاصل نصف ساعة."));
                      const result = status === "APPROVED" ? await client.scheduleContent(record.id, date) : await client.rescheduleContent(record.id, date);
                      remember(result);
                      setDialog(null);
                      setNotice(text("Scheduled in MARKOS.", "جُدول في MARKOS."));
                    })
                  }
                  type="button"
                >
                  {text("Confirm schedule", "تأكيد الجدولة")}
                </button>
              </div>
            </div>
          )}
          {(dialog === "delete" || dialog === "unschedule") && (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6">
                {dialog === "delete"
                  ? text("This deletes the draft. Its media stays in the workspace library.", "يحذف هذا المسودة وتبقى وسائطها في مكتبة مساحة العمل.")
                  : text("This removes the publishing time and returns the post to Ready.", "يزيل هذا وقت النشر ويعيد المنشور إلى جاهز.")}
              </p>
              <button
                className="studio-button studio-button-primary"
                disabled={!!busy}
                onClick={() =>
                  void run(text("Updating post…", "جارٍ تحديث المنشور…"), async () => {
                    if (!record) return;
                    if (dialog === "delete") {
                      await client.deleteContent(record.id);
                      setRecords((current) => current.filter((item) => item.id !== record.id));
                      finishExit({ kind: "new" });
                    } else remember(await client.unscheduleContent(record.id));
                    setDialog(null);
                  })
                }
                type="button"
              >
                {dialog === "delete" ? text("Delete draft", "حذف المسودة") : text("Cancel schedule", "إلغاء الجدولة")}
              </button>
            </div>
          )}
        </StudioDialog>
      )}
    </section>
  );
}

function StudioDialog({
  title,
  busy,
  onClose,
  closeLabel,
  children
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="studio-dialog"
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button aria-label={closeLabel} className="studio-button" disabled={busy} onClick={onClose} type="button">
          <X size={17} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function statusText(status: ContentRecord["status"], locale: Locale): string {
  const labels = {
    DRAFT: ["Draft", "مسودة"],
    IN_REVIEW: ["In review", "قيد المراجعة"],
    APPROVED: ["Ready", "جاهز"],
    SCHEDULED: ["Scheduled", "مجدول"],
    PUBLISHED: ["Published", "منشور"],
    FAILED: ["Needs attention", "يحتاج إلى مراجعة"]
  };
  return labels[status][locale === "ar" ? 1 : 0] ?? status;
}
function errorText(cause: unknown, locale: Locale): string {
  return cause instanceof Error
    ? cause.message
    : locale === "ar"
      ? "تعذر إكمال الإجراء. حاول مرة أخرى."
      : "The action could not be completed. Please try again.";
}
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Choose a valid JPEG image."));
    };
    image.src = url;
  });
}
