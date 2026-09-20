"use client";
/* eslint-disable @next/next/no-img-element -- Media Library URLs are rendered without image optimization. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clapperboard,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Instagram,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RectangleVertical,
  Send,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import type {
  ContentRecord,
  ContentType,
  Locale,
  MediaAssetRecord,
  ContentConversationRecord,
  MediaGenerationJobRecord,
  PublishJobRecord,
  ConversationTurnInput
} from "@markos/shared-types";
import type { ContentConversionResult } from "@markos/api-client";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import { CreateSaveCoordinator, selectedMediaId, fieldValue, type FieldEdit, type AuthoringOperation } from "./create-save-coordinator";
import { ContentStudioPreview } from "./content-studio-preview";
import { ContentStudioMediaLibrary } from "./content-studio-media-library";
import { ContentStatusBadge } from "./content-status-badge";
import { useModalDialog } from "./use-modal-dialog";
import { PublishTimeFields } from "./publish-time-fields";
import { plannedAtInputToIso } from "./content-studio-draft-state";
import "./content-studio.css";
import "./create-workspace.css";

const icons = { POST: ImageIcon, CAROUSEL: Images, REEL: Clapperboard, STORY: RectangleVertical };
const running = (job: MediaGenerationJobRecord | null) => !!job && ["QUEUED", "STARTING", "GENERATING", "PROCESSING"].includes(job.status);
export function ContentStudioPanel({ locale }: { locale: Locale }) {
  const client = useMarkosClient(locale),
    session = useMarkosSession();
  const api = useRef(client);
  useEffect(() => {
    api.current = client;
  }, [client]);
  const ar = locale === "ar",
    t = (en: string, arabic: string) => (ar ? arabic : en);
  const [, render] = useState(0);
  const [coordinator, setCoordinator] = useState<CreateSaveCoordinator | null>(null);
  const current = useRef<CreateSaveCoordinator | null>(null);
  const navigation = useRef<{ url: string; state: unknown } | null>(null);
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const working = useRef(false);
  const [tab, setTab] = useState<"caption" | "media" | "details">("media");
  const [panel, setPanel] = useState<"assistant" | "preview">("assistant");
  const [selection, setSelection] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ContentConversationRecord | null>(null);
  const [prompt, setPrompt] = useState("");
  const [publishJob, setPublishJob] = useState<PublishJobRecord | null>(null);
  const [videoJob, setVideoJob] = useState<MediaGenerationJobRecord | null>(null);
  const [dialog, setDialog] = useState<"library" | "open" | "schedule" | null>(null);
  const [conversion, setConversion] = useState<ContentConversionResult | null>(null),
    [retain, setRetain] = useState("");
  const [confirmation, setConfirmation] = useState<{ title: string; detail: string; run: () => Promise<void> } | null>(null);
  const [schedule, setSchedule] = useState("");
  const upload = useRef<HTMLInputElement>(null),
    transcript = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  const pendingSend = useRef<{ id: string; input: ConversationTurnInput } | null>(null);
  const initialization = useRef<Promise<{ record: ContentRecord; assets: MediaAssetRecord[] }> | null>(null);
  const record = coordinator?.record ?? null;
  const selected = record?.mediaItems.find((item) => item.id === selectedMediaId(record, selection));
  const asset = assets.find((asset) => asset.id === selected?.mediaAssetId);
  const editable = coordinator?.editable ?? false,
    locked = !editable || !!busy || !!conversion || !!confirmation;
  const conversationActive = !!conversation?.latestRun && ["QUEUED", "RUNNING", "DISPATCHING"].includes(conversation.latestRun.status);
  const publishing = !!publishJob && ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(publishJob.status);
  const activeGeneration = conversation?.latestRun?.actions?.generation.some((item) => ["PENDING", "DISPATCHING", "QUEUED", "RUNNING"].includes(item.status));
  const media = record?.mediaItems.map((item) => assets.find((asset) => asset.id === item.mediaAssetId) ?? null) ?? [];
  function mountRecord(next: ContentRecord) {
    current.current?.dispose();
    const instance = new CreateSaveCoordinator(
      next,
      (expectedRevision, operations) => api.current.mutateContent(next.id, { expectedRevision, operations }),
      () => render((v) => v + 1)
    );
    current.current = instance;
    setCoordinator(instance);
    setSelection(next.mediaItems[0]?.id ?? null);
    setConversation(null);
    setVideoJob(null);
    setPublishJob(null);
    setError("");
    setNotice("");
    pendingSend.current = null;
    const url = new URL(window.location.href);
    url.searchParams.set("item", next.id);
    window.history.replaceState(window.history.state, "", url);
    navigation.current = { url: url.href, state: window.history.state };
  }
  useEffect(() => {
    if (!session) return;
    let active = true;
    if (!initialization.current) {
      const id = new URLSearchParams(window.location.search).get("item");
      initialization.current = Promise.all([id ? api.current.contentItem(id) : api.current.createContent(), api.current.mediaAssets()]).then(
        ([record, assets]) => ({ record, assets })
      );
    }
    initialization.current
      .then((result) => {
        if (active) {
          setAssets(result.assets);
          mountRecord(result.record);
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
    };
    // Workspace changes remount Create; token renewal must preserve local work.
  }, [session?.workspace.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!coordinator) return;
    let cancelled = false;
    Promise.all([
      api.current.contentConversation(coordinator.record.id),
      api.current.latestMediaGenerationJob(coordinator.record.id),
      api.current.latestPublishJob(coordinator.record.id)
    ])
      .then(([thread, job, publish]) => {
        if (!cancelled) {
          setConversation(thread);
          setVideoJob(job);
          setPublishJob(publish);
          coordinator.receive(thread.contentItem);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(message(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [coordinator]);
  const [pollTick, setPollTick] = useState(0);
  useEffect(() => {
    if (!coordinator || (!conversationActive && !running(videoJob) && !activeGeneration && !publishing)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const thread = await api.current.contentConversation(coordinator.record.id);
        const job = videoJob ? await api.current.mediaGenerationJob(videoJob.id) : null;
        const freshAssets = await api.current.mediaAssets();
        const publication = publishing ? await api.current.latestPublishJob(coordinator.record.id) : null;
        const finished = (job && !running(job)) || (publication && !["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(publication.status));
        const settled = finished ? await api.current.contentItem(coordinator.record.id) : thread.contentItem;
        if (cancelled) return;
        coordinator.receive(settled);
        setConversation(thread);
        setAssets(freshAssets);
        if (job) setVideoJob(job);
        if (publication) setPublishJob(publication);
      } catch (cause) {
        if (!cancelled) {
          setError(message(cause));
          setPollTick((n) => n + 1);
        }
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [coordinator, conversation, conversationActive, videoJob, activeGeneration, pollTick, publishing]);
  useEffect(() => {
    if (follow.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [conversation, panel]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current?.unsaved) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        !link ||
        link.target === "_blank" ||
        link.origin !== location.origin ||
        link.href === location.href ||
        !current.current?.unsaved
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void current.current
        .flush()
        .then(() => window.location.assign(link.href))
        .catch((cause) => setError(message(cause)));
    };
    const back = (event: PopStateEvent) => {
      const pending = current.current,
        origin = navigation.current;
      if (!pending?.unsaved || !origin) return;
      const destination = window.location.href;
      event.stopImmediatePropagation();
      window.history.pushState(origin.state, "", origin.url);
      void run("navigate", async () => {
        await pending.flush();
        window.location.assign(destination);
      });
    };
    window.addEventListener("popstate", back, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("popstate", back, true);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
      current.current?.dispose();
    };
  }, []);
  async function run(label: string, work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(message(cause));
    } finally {
      working.current = false;
      setBusy("");
    }
  }
  const edit = (change: FieldEdit) => {
    if (!locked) coordinator?.edit(change);
  };
  async function mutate(operations: AuthoringOperation[]) {
    if (!coordinator) return;
    await coordinator.action(async (current) => {
      const saved = await api.current.mutateContent(current.id, { expectedRevision: current.revision, operations });
      return { result: saved, record: saved };
    });
  }
  const structure = (operations: AuthoringOperation[]) => run("structure", () => mutate(operations));
  async function attach(chosen: MediaAssetRecord) {
    if (!coordinator || !selected) return;
    const id = selected.id;
    await coordinator.action(async (current) => {
      const saved = await api.current.attachMediaToContent(current.id, { contentMediaItemId: id, mediaAssetId: chosen.id, expectedRevision: current.revision });
      return { result: saved, record: saved };
    });
    setDialog(null);
  }
  async function generate() {
    if (!coordinator || !selected) return;
    const id = selected.id;
    await coordinator.action(async (current) => {
      const item = current.mediaItems.find((item) => item.id === id)!;
      if (item.mediaKind === "VIDEO") {
        const job = await api.current.generateContentVideo(current.id, { contentMediaItemId: id, expectedRevision: current.revision });
        setVideoJob(job);
        setNotice(t("Video generation queued.", "أُضيف توليد الفيديو إلى الانتظار."));
        return { result: undefined, record: await api.current.contentItem(current.id) };
      }
      try {
        const result = await api.current.generateContentImage(current.id, { contentMediaItemId: id, expectedRevision: current.revision });
        setAssets((old) => [...old.filter((a) => a.id !== result.mediaAsset.id), result.mediaAsset]);
        setNotice(t("Generated media attached.", "أُرفقت الوسائط المولّدة."));
        return { result: undefined, record: result.contentItem };
      } catch (cause) {
        setAssets(await api.current.mediaAssets());
        coordinator.receive(await api.current.contentItem(current.id));
        throw cause;
      }
    });
  }
  async function send() {
    if (!coordinator || !prompt.trim()) return;
    const sent = prompt;
    await coordinator.action(async (current) => {
      const prior = pendingSend.current;
      const input =
        prior?.id === current.id && prior.input.message === sent && prior.input.expectedRevision === current.revision
          ? prior.input
          : { requestId: crypto.randomUUID(), expectedRevision: current.revision, message: sent, locale };
      pendingSend.current = { id: current.id, input };
      const thread = await api.current.sendConversationMessage(current.id, input);
      pendingSend.current = null;
      setConversation(thread);
      setPrompt((value) => (value === sent ? "" : value));
      follow.current = true;
      return { result: undefined, record: thread.contentItem };
    });
  }
  async function convert(type: ContentType, confirmed = false) {
    if (!coordinator) return;
    await coordinator.action(async (current) => {
      const result = await api.current.convertContent(current.id, {
        expectedRevision: confirmed && conversion ? conversion.content.revision : current.revision,
        contentType: type,
        confirmDestructive: confirmed,
        ...(retain ? { retainMediaItemId: retain } : {})
      });
      if (result.applied) {
        setConversion(null);
        setRetain("");
      } else setConversion(result);
      return { result: undefined, record: result.content };
    });
  }
  async function ready() {
    if (!coordinator) return;
    await coordinator.action(async (current) => {
      const saved = await api.current.updateContentStatus(current.id, "APPROVED", current.revision);
      return { result: undefined, record: saved };
    });
  }
  async function open(id?: string) {
    await coordinator?.flush();
    const next = id ? await api.current.contentItem(id) : await api.current.createContent();
    mountRecord(next);
    setDialog(null);
  }
  function reorder(ids: string[], id: string, delta: number, type: "reorderMediaItems" | "reorderReelBeats") {
    const index = ids.indexOf(id),
      target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    next.splice(index, 1);
    next.splice(target, 0, id);
    void structure([{ type, orderedIds: next }]);
  }
  function field(label: string, change: FieldEdit, multiline = false, max?: number) {
    return (
      <label className="studio-field">
        <span>{label}</span>
        {multiline ? (
          <textarea
            aria-label={label}
            dir="auto"
            rows={change.kind === "media" && change.field === "visualDirection" ? 5 : 3}
            disabled={locked}
            value={change.value ?? ""}
            maxLength={max}
            onChange={(e) => edit({ ...change, value: e.target.value } as FieldEdit)}
          />
        ) : (
          <input
            aria-label={label}
            dir="auto"
            disabled={locked}
            value={change.value ?? ""}
            maxLength={max}
            onChange={(e) => edit({ ...change, value: e.target.value } as FieldEdit)}
          />
        )}
      </label>
    );
  }
  const kindName = (type: ContentType) =>
    ({ POST: t("Post", "منشور"), CAROUSEL: t("Carousel", "منشور متعدد"), REEL: t("Reel", "ريل"), STORY: t("Story", "قصة") })[type];
  if (!record || !coordinator)
    return (
      <div className="p-6" role="status">
        {error || t("Opening Create…", "جارٍ فتح المحرر…")}
      </div>
    );
  const TypeIcon = icons[record.contentType],
    activeTab = record.contentType === "STORY" && tab === "caption" ? "media" : tab;
  const saveLabel = {
    saved: t("All changes saved", "حُفظت جميع التغييرات"),
    pending: t("Unsaved changes", "تغييرات قيد الحفظ"),
    saving: t("Saving…", "جارٍ الحفظ…"),
    failed: t("Save failed", "تعذر الحفظ"),
    conflict: t("Conflict — needs attention", "تعارض — يلزم المراجعة")
  }[coordinator.status];
  const proposal = conversation?.latestRun?.confirmation;
  return (
    <div className="create-workspace" data-testid="create-workspace" dir={ar ? "rtl" : "ltr"}>
      {(error || notice) && (
        <div className={error ? "create-alert" : "create-notice"} role={error ? "alert" : "status"}>
          {error || notice}
          <button
            aria-label={t("Dismiss", "إغلاق")}
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {["conflict", "failed"].includes(coordinator.status) && (
        <div className="create-alert" role="alert">
          <strong>{saveLabel}</strong>
          <p>{t("Your local input is preserved. Review before applying your changes.", "إدخالك المحلي محفوظ. راجعه قبل تطبيق التغييرات.")}</p>
          <details>
            <summary>{t("Preserved local input", "الإدخال المحلي المحفوظ")}</summary>
            {coordinator.recoveryEdits.map((e, i) => (
              <p key={i} dir="auto">
                {fieldLabel(e.field, ar)}: {String(e.value ?? "")}
              </p>
            ))}
          </details>
          {coordinator.status === "failed" ? (
            <button className="studio-button" onClick={() => void run("retry", () => coordinator.retry())}>
              {t("Retry save", "إعادة الحفظ")}
            </button>
          ) : (
            <button
              className="studio-button"
              onClick={() =>
                void run("review", async () => {
                  const remote = await api.current.contentItem(record.id);
                  setConfirmation({
                    title: t("Apply preserved input?", "تطبيق الإدخال المحفوظ؟"),
                    detail: coordinator.recoveryEdits
                      .map(
                        (edit) =>
                          `${fieldLabel(edit.field, ar)}\n${t("Saved", "المحفوظ")}: ${String(fieldValue(remote, edit) ?? "—")}\n${t("Your input", "إدخالك")}: ${String(edit.value ?? "—")}`
                      )
                      .join("\n\n"),
                    run: async () => coordinator.resolve(remote, true)
                  });
                  coordinator.receive(remote);
                })
              }
            >
              {t("Review conflict", "مراجعة التعارض")}
            </button>
          )}
          <button
            className="studio-button"
            onClick={() =>
              setConfirmation({
                title: t("Use server version?", "استخدام نسخة الخادم؟"),
                detail: t("This discards preserved local changes.", "سيتم تجاهل التغييرات المحلية المحفوظة."),
                run: async () => coordinator.resolve(await api.current.contentItem(record.id), false)
              })
            }
          >
            {t("Use server version", "استخدام نسخة الخادم")}
          </button>
        </div>
      )}
      <div className="create-columns">
        <section className="create-editor" aria-label={t("Content editor", "محرر المحتوى")}>
          <header className="create-header">
            <strong className="truncate">{record.brief?.split("\n")[0] || t("Create content", "إنشاء محتوى")}</strong>
            <ContentStatusBadge status={record.status} locale={locale} />
            {record.campaignId && <a href={`/${locale}/app/campaigns?campaign=${record.campaignId}`}>{t("Campaign ↗", "الحملة ↗")}</a>}
            <div className="create-header-actions">
              <button
                className="studio-button"
                disabled={!!busy}
                onClick={() =>
                  void run("open", async () => {
                    await coordinator.flush();
                    setRecords(await api.current.contentItems());
                    setDialog("open");
                  })
                }
              >
                <FolderOpen size={17} />
                {t("Open", "فتح")}
              </button>
              <button className="studio-button" disabled={!!busy} onClick={() => void run("new", () => open())}>
                <Plus size={17} />
                {t("New", "جديد")}
              </button>
              <details className="create-menu">
                <summary aria-label={t("More actions", "المزيد")}>
                  <MoreHorizontal />
                </summary>
                <div>
                  <button
                    className="studio-button"
                    onClick={() =>
                      void run("leave", async () => {
                        await coordinator.flush();
                        window.location.assign(`/${locale}/app`);
                      })
                    }
                  >
                    {t("Leave", "مغادرة")}
                  </button>
                  {record.status === "APPROVED" && (
                    <>
                      <button className="studio-button" onClick={() => setDialog("schedule")}>
                        {t("Schedule", "جدولة")}
                      </button>
                      <button
                        className="studio-button"
                        onClick={() =>
                          setConfirmation({
                            title: t("Publish now?", "النشر الآن؟"),
                            detail: t("Publish this Ready content to Instagram.", "نشر هذا المحتوى الجاهز على Instagram."),
                            run: async () => {
                              await coordinator.action(async (current) => {
                                setPublishJob(await api.current.publishContentNow(current.id));
                                return { result: undefined, record: await api.current.contentItem(current.id) };
                              });
                              setNotice(t("Publishing requested.", "طُلب النشر."));
                            }
                          })
                        }
                      >
                        {t("Publish now", "النشر الآن")}
                      </button>
                    </>
                  )}
                  {record.status === "SCHEDULED" && (
                    <button
                      className="studio-button"
                      onClick={() =>
                        setConfirmation({
                          title: t("Unschedule?", "إلغاء الجدولة؟"),
                          detail: t("Remove this scheduled publication.", "إزالة هذا المنشور المجدول."),
                          run: async () => {
                            await coordinator.action(async (current) => {
                              const saved = await api.current.unscheduleContent(current.id);
                              return { result: undefined, record: saved };
                            });
                          }
                        })
                      }
                    >
                      {t("Unschedule", "إلغاء الجدولة")}
                    </button>
                  )}
                  {editable && (
                    <button
                      className="studio-button"
                      onClick={() =>
                        setConfirmation({
                          title: t("Delete draft?", "حذف المسودة؟"),
                          detail: t("Library files are kept.", "سيتم الاحتفاظ بملفات المكتبة."),
                          run: async () => {
                            await coordinator.action(async (current) => {
                              await api.current.deleteContent(current.id, current.revision);
                              return { result: undefined };
                            });
                            await open();
                          }
                        })
                      }
                    >
                      <Trash2 size={16} />
                      {t("Delete draft", "حذف المسودة")}
                    </button>
                  )}
                </div>
              </details>
            </div>
          </header>
          <div className="create-toolbar">
            <label className="create-type">
              <TypeIcon size={21} />
              <select
                aria-label={t("Content type", "نوع المحتوى")}
                value={record.contentType}
                disabled={locked}
                onChange={(e) => {
                  setRetain("");
                  void run("convert", () => convert(e.target.value as ContentType));
                }}
              >
                {(Object.keys(icons) as ContentType[]).map((type) => (
                  <option key={type} value={type}>
                    {kindName(type)}
                  </option>
                ))}
              </select>
            </label>
            <nav aria-label={t("Editor tabs", "أقسام المحرر")}>
              {(["caption", "media", "details"] as const)
                .filter((value) => value !== "caption" || record.contentType !== "STORY")
                .map((value) => (
                  <button key={value} className="studio-button" aria-current={activeTab === value ? "page" : undefined} onClick={() => setTab(value)}>
                    {value === "caption" ? t("Caption", "النص") : value === "media" ? t("Media", "الوسائط") : t("Details", "التفاصيل")}
                  </button>
                ))}
            </nav>
          </div>
          <div className="create-editor-body">
            {activeTab === "caption" && (
              <div className="create-caption">
                {field(t("Caption", "النص"), { kind: "content", field: "caption", value: record.caption }, true, 2200)}
                <p className="create-muted">{Array.from(record.caption).length} / 2200</p>
              </div>
            )}
            {activeTab === "details" && (
              <div className="create-details">
                {field(t("Content pillar", "محور المحتوى"), { kind: "content", field: "contentPillar", value: record.contentPillar ?? "" }, false, 160)}
                {field(t("Post objective", "هدف المنشور"), { kind: "content", field: "campaignGoal", value: record.campaignGoal ?? "" }, false, 500)}
                {field(t("Tone", "النبرة"), { kind: "content", field: "tone", value: record.tone ?? "" }, false, 200)}
                <div className="create-wide">{field(t("Brief", "الموجز"), { kind: "content", field: "brief", value: record.brief ?? "" }, true, 1000)}</div>
              </div>
            )}
            {activeTab === "media" && selected && (
              <>
                {record.contentType === "CAROUSEL" && (
                  <div className="create-slide-strip" aria-label={t("Carousel slides", "شرائح المنشور")}>
                    {record.mediaItems.map((item, index) => {
                      const thumbnail = assets.find((asset) => asset.id === item.mediaAssetId);
                      return (
                        <div
                          className="create-slide"
                          key={item.id}
                          draggable={!locked}
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (locked) return;
                            const id = e.dataTransfer.getData("text/plain");
                            const ids = record.mediaItems.map((item) => item.id);
                            if (!ids.includes(id)) return;
                            ids.splice(ids.indexOf(id), 1);
                            ids.splice(index, 0, id);
                            void structure([{ type: "reorderMediaItems", orderedIds: ids }]);
                          }}
                        >
                          <button
                            className="create-slide-select"
                            aria-pressed={selected.id === item.id}
                            aria-label={t(`Select slide ${index + 1}`, `اختر الشريحة ${index + 1}`)}
                            onClick={() => setSelection(item.id)}
                          >
                            {thumbnail ? <img src={thumbnail.publicUrl} alt="" /> : <Images size={24} />}
                            <span>{index + 1}</span>
                          </button>
                          <div>
                            <button
                              aria-label={t(`Move slide ${index + 1} earlier`, `تقديم الشريحة ${index + 1}`)}
                              disabled={locked || index === 0}
                              onClick={() =>
                                reorder(
                                  record.mediaItems.map((i) => i.id),
                                  item.id,
                                  -1,
                                  "reorderMediaItems"
                                )
                              }
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              aria-label={t(`Move slide ${index + 1} later`, `تأخير الشريحة ${index + 1}`)}
                              disabled={locked || index === record.mediaItems.length - 1}
                              onClick={() =>
                                reorder(
                                  record.mediaItems.map((i) => i.id),
                                  item.id,
                                  1,
                                  "reorderMediaItems"
                                )
                              }
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      className="create-add-slide"
                      disabled={locked || record.mediaItems.length >= 10}
                      onClick={() =>
                        void run("add", async () => {
                          const previous = record.mediaItems.map((i) => i.id);
                          await mutate([{ type: "addMediaItem", fields: {} }]);
                          setSelection(coordinator.record.mediaItems.find((i) => !previous.includes(i.id))?.id ?? selected.id);
                        })
                      }
                    >
                      <Plus />
                      {t("Add slide", "إضافة شريحة")}
                    </button>
                  </div>
                )}
                {record.contentType === "REEL" && (
                  <section className="create-script" aria-label={t("Reel script", "سيناريو الريل")}>
                    <h2>{t("Reel script", "سيناريو الريل")}</h2>
                    <div className="create-details">
                      {field(t("Hook", "المقدمة"), { kind: "script", field: "hook", value: record.reelScript?.hook ?? "" }, false, 300)}
                      <label className="studio-field">
                        <span>{t("Intended Reel duration (seconds)", "مدة الريل المقصودة (ثوانٍ)")}</span>
                        <input
                          aria-label={t("Intended Reel duration (seconds)", "مدة الريل المقصودة (ثوانٍ)")}
                          type="number"
                          min={1}
                          max={3600}
                          disabled={locked}
                          value={record.reelScript?.intendedDurationSeconds ?? ""}
                          onChange={(e) => edit({ kind: "script", field: "intendedDurationSeconds", value: e.target.value ? Number(e.target.value) : null })}
                        />
                      </label>
                    </div>
                    <ol className="create-beats">
                      {record.reelScript?.beats.map((beat, index) => (
                        <li key={beat.id}>
                          {field(t(`Beat ${index + 1}`, `المشهد ${index + 1}`), { kind: "beat", id: beat.id, field: "text", value: beat.text }, true, 800)}
                          <div className="create-inline">
                            <button
                              className="studio-button"
                              disabled={locked || index === 0}
                              aria-label={t(`Move beat ${index + 1} earlier`, `تقديم المشهد ${index + 1}`)}
                              onClick={() =>
                                reorder(
                                  record.reelScript!.beats.map((b) => b.id),
                                  beat.id,
                                  -1,
                                  "reorderReelBeats"
                                )
                              }
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              className="studio-button"
                              disabled={locked || index === record.reelScript!.beats.length - 1}
                              aria-label={t(`Move beat ${index + 1} later`, `تأخير المشهد ${index + 1}`)}
                              onClick={() =>
                                reorder(
                                  record.reelScript!.beats.map((b) => b.id),
                                  beat.id,
                                  1,
                                  "reorderReelBeats"
                                )
                              }
                            >
                              <ArrowDown size={16} />
                            </button>
                            <button
                              className="studio-button"
                              disabled={locked}
                              aria-label={t(`Remove beat ${index + 1}`, `حذف المشهد ${index + 1}`)}
                              onClick={() =>
                                setConfirmation({
                                  title: t("Remove beat?", "حذف المشهد؟"),
                                  detail: beat.text,
                                  run: () => mutate([{ type: "removeReelBeat", beatId: beat.id }])
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button className="studio-button" disabled={locked} onClick={() => void structure([{ type: "addReelBeat", text: "" }])}>
                      <Plus size={17} />
                      {t("Add beat", "إضافة مشهد")}
                    </button>
                  </section>
                )}
                <section className="create-media-workspace" data-selected-item={selected.id}>
                  <header className="create-inline">
                    <h2>
                      {record.contentType === "CAROUSEL"
                        ? t(
                            `Slide ${record.mediaItems.indexOf(selected) + 1} of ${record.mediaItems.length}`,
                            `الشريحة ${record.mediaItems.indexOf(selected) + 1} من ${record.mediaItems.length}`
                          )
                        : record.contentType === "REEL"
                          ? t("Video media", "وسائط الفيديو")
                          : kindName(record.contentType)}
                    </h2>
                    {record.contentType === "CAROUSEL" && (
                      <button
                        className="studio-button"
                        disabled={locked || record.mediaItems.length === 1}
                        onClick={() =>
                          setConfirmation({
                            title: t("Remove slide?", "حذف الشريحة؟"),
                            detail: t("Creative fields will be removed. Its Library asset is kept.", "ستُحذف الحقول مع الاحتفاظ بملف المكتبة."),
                            run: () => mutate([{ type: "removeMediaItem", itemId: selected.id }])
                          })
                        }
                      >
                        <Trash2 size={16} />
                        {t("Remove slide", "حذف الشريحة")}
                      </button>
                    )}
                  </header>
                  <div className="create-media-grid">
                    <div>
                      <div className={`create-media-preview ${record.contentType === "STORY" || selected.mediaKind === "VIDEO" ? "create-vertical" : ""}`}>
                        {asset ? (
                          asset.mimeType.startsWith("video/") ? (
                            <video controls playsInline src={asset.publicUrl} aria-label={asset.filename} />
                          ) : (
                            <img src={asset.publicUrl} alt={asset.filename} />
                          )
                        ) : (
                          <div className="create-empty-media">
                            <ImageIcon size={40} />
                            <span>{t("Generate or choose media", "ولّد الوسائط أو اخترها")}</span>
                          </div>
                        )}
                      </div>
                      <div className="create-media-actions">
                        <button
                          className="studio-button studio-button-primary"
                          disabled={locked || !selected.visualDirection?.trim() || (running(videoJob) && videoJob?.contentMediaItemId === selected.id)}
                          onClick={() => void run("generate", generate)}
                        >
                          <Sparkles size={17} />
                          {t("Generate", "توليد")}
                        </button>
                        <button className="studio-button" disabled={locked} onClick={() => upload.current?.click()}>
                          {t("Replace", "استبدال")}
                        </button>
                        <button className="studio-button" disabled={locked} onClick={() => setDialog("library")}>
                          <FolderOpen size={16} />
                          {t("Library", "المكتبة")}
                        </button>
                        {selected.mediaAssetId && (
                          <button
                            className="studio-button"
                            aria-label={t("Detach media", "فصل الوسائط")}
                            disabled={locked}
                            onClick={() =>
                              void run("detach", async () => {
                                await coordinator.action(async (current) => {
                                  const saved = await api.current.detachMediaFromContent(current.id, selected.id, current.revision);
                                  return { result: undefined, record: saved };
                                });
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      {videoJob && videoJob.contentMediaItemId === selected.id && (
                        <p role="status" className="create-muted">
                          {running(videoJob)
                            ? t("Video generation in progress…", "جارٍ توليد الفيديو…")
                            : videoJob.status === "COMPLETED"
                              ? videoJob.attachmentApplied
                                ? t("Video attached.", "أُرفق الفيديو.")
                                : t("Video saved to Library; newer draft preserved.", "حُفظ الفيديو في المكتبة دون تغيير المسودة الأحدث.")
                              : videoJob.errorMessage || t("Video generation stopped.", "توقف توليد الفيديو.")}
                        </p>
                      )}
                      {videoJob && videoJob.contentMediaItemId === selected.id && running(videoJob) && (
                        <button
                          className="studio-button"
                          disabled={!!busy}
                          onClick={() =>
                            void run("cancel-video", async () => {
                              await coordinator.action(async () => {
                                setVideoJob(await api.current.cancelMediaGeneration(videoJob.id));
                                return { result: undefined };
                              });
                            })
                          }
                        >
                          {t("Cancel generation", "إلغاء التوليد")}
                        </button>
                      )}
                      {videoJob?.contentMediaItemId === selected.id && videoJob?.retryable && !videoJob.outputMediaAssetId && !running(videoJob) && (
                        <button
                          className="studio-button"
                          disabled={locked}
                          onClick={() =>
                            void run("retry-video", async () => {
                              await coordinator.action(async (current) => {
                                setVideoJob(await api.current.retryMediaGeneration(videoJob.id, current.revision));
                                return { result: undefined, record: await api.current.contentItem(current.id) };
                              });
                            })
                          }
                        >
                          {t("Retry video generation", "إعادة توليد الفيديو")}
                        </button>
                      )}
                    </div>
                    <div className="create-media-fields">
                      {record.contentType === "STORY" && (
                        <label className="studio-field">
                          <span>{t("Media format", "تنسيق الوسائط")}</span>
                          <select
                            aria-label={t("Media format", "تنسيق الوسائط")}
                            value={selected.mediaKind ?? "IMAGE"}
                            disabled={locked || !!selected.mediaAssetId}
                            onChange={(e) =>
                              void structure([
                                {
                                  type: "updateMediaItem",
                                  itemId: selected.id,
                                  fields: { mediaKind: e.target.value as "IMAGE" | "VIDEO", generationDurationSeconds: null, aspectRatio: "VERTICAL" }
                                }
                              ])
                            }
                          >
                            <option value="IMAGE">{t("Image", "صورة")}</option>
                            <option value="VIDEO">{t("Video", "فيديو")}</option>
                          </select>
                          {selected.mediaAssetId && <small>{t("Detach media to change its format.", "افصل الوسائط لتغيير تنسيقها.")}</small>}
                        </label>
                      )}
                      {record.contentType === "CAROUSEL" && (
                        <>
                          {field(t("Purpose", "الغرض"), { kind: "media", id: selected.id, field: "purpose", value: selected.purpose ?? "" }, false, 160)}
                          {field(
                            t("Slide title", "عنوان الشريحة"),
                            { kind: "media", id: selected.id, field: "title", value: selected.title ?? "" },
                            false,
                            160
                          )}
                          {field(t("Slide body", "نص الشريحة"), { kind: "media", id: selected.id, field: "body", value: selected.body ?? "" }, true, 800)}
                        </>
                      )}
                      {field(
                        t("Visual direction", "التوجيه البصري"),
                        { kind: "media", id: selected.id, field: "visualDirection", value: selected.visualDirection ?? "" },
                        true,
                        2000
                      )}
                      <div className="create-settings">
                        <label className="studio-field">
                          <span>{t("Aspect ratio", "نسبة الأبعاد")}</span>
                          <select
                            aria-label={t("Aspect ratio", "نسبة الأبعاد")}
                            disabled={locked}
                            value={selected.aspectRatio ?? (record.contentType === "STORY" || selected.mediaKind === "VIDEO" ? "VERTICAL" : "PORTRAIT")}
                            onChange={(e) => edit({ kind: "media", id: selected.id, field: "aspectRatio", value: e.target.value })}
                          >
                            {selected.mediaKind !== "VIDEO" && (
                              <>
                                <option value="SQUARE">1:1</option>
                                <option value="PORTRAIT">4:5</option>
                              </>
                            )}
                            <option value="VERTICAL">9:16</option>
                          </select>
                        </label>
                        {selected.mediaKind === "VIDEO" && (
                          <label className="studio-field">
                            <span>{t("Generated clip duration", "مدة المقطع المولّد")}</span>
                            <select
                              aria-label={t("Generated clip duration", "مدة المقطع المولّد")}
                              disabled={locked}
                              value={selected.generationDurationSeconds ?? 8}
                              onChange={(e) => edit({ kind: "media", id: selected.id, field: "generationDurationSeconds", value: Number(e.target.value) })}
                            >
                              {[4, 8, 12].map((n) => (
                                <option value={n} key={n}>
                                  {n} {t("seconds", "ثوانٍ")}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
          {publishJob && (
            <p className="create-muted" role="status">
              {publishing
                ? t("Publishing in progress…", "جارٍ النشر…")
                : publishJob.status === "FAILED"
                  ? publishJob.lastErrorMessage || t("Publishing failed.", "فشل النشر.")
                  : publishJob.status === "PUBLISHED"
                    ? t("Published on Instagram.", "نُشر على Instagram.")
                    : ""}
            </p>
          )}
          <footer className="create-footer">
            <span role="status">
              <Check size={16} />
              {saveLabel}
            </span>
            {!editable && <span>{t("Read-only", "للقراءة فقط")}</span>}
            {record.status === "APPROVED" && (
              <button
                className="studio-button"
                disabled={!!busy}
                onClick={() =>
                  void run("draft", async () => {
                    await coordinator.action(async (current) => {
                      const saved = await api.current.updateContentStatus(current.id, "DRAFT", current.revision);
                      return { result: undefined, record: saved };
                    });
                  })
                }
              >
                {t("Return to Draft", "العودة إلى المسودة")}
              </button>
            )}
            <button className="studio-button studio-button-primary" disabled={locked} onClick={() => void run("ready", ready)}>
              <Check size={17} />
              {t("Mark Ready", "تحديد كجاهز")}
            </button>
          </footer>
        </section>
        <aside className="create-companion" aria-label="MARKOS">
          <header className="create-companion-header">
            <strong>
              <Sparkles size={22} /> MARKOS
            </strong>
            <div className="create-panel-toggle">
              <button aria-pressed={panel === "assistant"} onClick={() => setPanel("assistant")}>
                {t("Assistant", "المساعد")}
              </button>
              <button aria-pressed={panel === "preview"} onClick={() => setPanel("preview")}>
                {t("Preview", "المعاينة")}
              </button>
            </div>
          </header>
          <div className="create-assistant" hidden={panel !== "assistant"}>
            <div
              className="create-transcript"
              ref={transcript}
              onScroll={() => {
                const e = transcript.current;
                if (e) follow.current = e.scrollHeight - e.clientHeight - e.scrollTop < 80;
              }}
            >
              {!conversation?.messages.length && (
                <p className="create-muted">
                  {t("What would you like to create? Ask MARKOS to develop or edit this draft.", "ماذا تريد أن تنشئ؟ اطلب من MARKOS تطوير المسودة أو تعديلها.")}
                </p>
              )}
              {conversation?.messages.map((turn) => (
                <div key={turn.id} className={`create-message create-message-${turn.role}`} dir="auto">
                  {turn.text}
                </div>
              ))}
              {conversationActive && (
                <div className="create-thinking" role="status">
                  <LoaderCircle className="animate-spin" size={20} />
                  {t("MARKOS is working…", "MARKOS يعمل…")}
                </div>
              )}
              {proposal && (
                <section className="create-proposal">
                  <strong>{t("Confirm proposed changes", "تأكيد التغييرات المقترحة")}</strong>
                  <ul>
                    {proposal.consequences.map((value) => (
                      <li key={value}>{value}</li>
                    ))}
                  </ul>
                  <button
                    className="studio-button"
                    disabled={!!busy}
                    onClick={() =>
                      void run("confirm", async () => {
                        await coordinator.action(async () => {
                          const thread = await api.current.confirmConversationActions(record.id, conversation!.latestRun!.id, {
                            confirmationToken: proposal.token,
                            expectedRevision: proposal.revision
                          });
                          setConversation(thread);
                          return { result: undefined, record: thread.contentItem };
                        });
                      })
                    }
                  >
                    {t("Confirm changes", "تأكيد التغييرات")}
                  </button>
                  <p className="create-muted">{t("Or send another instruction to change the proposal.", "أو أرسل تعليمات أخرى لتغيير الاقتراح.")}</p>
                </section>
              )}
              {conversation?.latestRun?.actions?.generation.map((item) => (
                <p className="create-muted" role="status" key={item.itemId}>
                  {t("Generation", "التوليد")}:{" "}
                  {
                    {
                      PENDING: t("Requested", "طُلب"),
                      DISPATCHING: t("Requesting", "جارٍ الطلب"),
                      QUEUED: t("Queued", "في الانتظار"),
                      RUNNING: t("Running", "جارٍ"),
                      ATTACHED: t("Completed and attached", "اكتمل وأُرفق"),
                      LIBRARY_ONLY: t("Saved to Library only", "حُفظ في المكتبة فقط"),
                      FAILED: t("Failed", "فشل"),
                      UNKNOWN: t("Outcome unknown — no automatic retry", "النتيجة غير معروفة — لن يُعاد تلقائياً")
                    }[item.status]
                  }
                </p>
              ))}
            </div>
            <form
              className="create-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void run("send", send);
              }}
            >
              <textarea
                aria-label={t("Message MARKOS", "راسل MARKOS")}
                placeholder={t("Tell MARKOS what to create or change…", "أخبر MARKOS بما تريد إنشاءه أو تغييره…")}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                maxLength={4000}
              />
              <button
                type="submit"
                className="studio-button studio-button-primary"
                aria-label={t("Send message", "إرسال رسالة")}
                disabled={!!busy || conversationActive || !prompt.trim() || ["failed", "conflict"].includes(coordinator.status)}
              >
                <Send size={19} />
              </button>
            </form>
          </div>
          <div className="create-preview" hidden={panel !== "preview"}>
            <p className="create-preview-label">
              <Instagram size={18} />
              {record.contentType === "STORY" ? t("Instagram Story preview", "معاينة قصة Instagram") : t("Instagram preview", "معاينة Instagram")}
            </p>
            <ContentStudioPreview
              locale={locale}
              brandName={session?.workspace.name ?? ""}
              contentType={record.contentType}
              caption={record.caption}
              media={media}
            />
          </div>
        </aside>
      </div>
      <input
        ref={upload}
        hidden
        type="file"
        accept="image/jpeg,video/mp4"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void run("upload", async () => {
            await coordinator.flush();
            const base64Data = await readBase64(file);
            const metadata = await videoMetadata(file);
            const uploaded = await api.current.uploadMedia({
              filename: file.name,
              mimeType: file.type,
              type: file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
              base64Data,
              ...metadata
            });
            setAssets((old) => [...old, uploaded]);
            await attach(uploaded);
          });
        }}
      />
      {dialog && (
        <StudioDialog
          title={dialog === "library" ? t("Media Library", "مكتبة الوسائط") : dialog === "open" ? t("Open content", "فتح محتوى") : t("Schedule", "جدولة")}
          onClose={() => setDialog(null)}
          busy={!!busy}
          locale={locale}
        >
          {error && <p role="alert">{error}</p>}
          {dialog === "library" && (
            <ContentStudioMediaLibrary
              assets={assets}
              attachedIds={record.mediaItems.flatMap((item) => (item.mediaAssetId ? [item.mediaAssetId] : []))}
              busy={!!busy}
              contentType={record.contentType}
              blockedReason=""
              locale={locale}
              onAttach={(chosen) => {
                if (chosen[0]) void run("attach", () => attach(chosen[0]!));
              }}
            />
          )}
          {dialog === "open" && (
            <div className="create-open-list">
              {records.map((item) => (
                <button className="studio-button" key={item.id} onClick={() => void run("open", () => open(item.id))}>
                  {item.brief || item.caption.slice(0, 60) || kindName(item.contentType)} <ContentStatusBadge locale={locale} status={item.status} />
                </button>
              ))}
            </div>
          )}
          {dialog === "schedule" && (
            <>
              <PublishTimeFields locale={locale} value={schedule} onChange={setSchedule} />
              <button
                className="studio-button studio-button-primary"
                disabled={!!busy || !schedule}
                onClick={() =>
                  void run("schedule", async () => {
                    await coordinator.action(async (current) => {
                      const saved = await api.current.scheduleContent(current.id, plannedAtInputToIso(schedule)!);
                      return { result: undefined, record: saved };
                    });
                    setDialog(null);
                  })
                }
              >
                {t("Schedule", "جدولة")}
              </button>
            </>
          )}
        </StudioDialog>
      )}
      {conversion && (
        <StudioDialog
          title={t("Change content type", "تغيير نوع المحتوى")}
          onClose={() => {
            setConversion(null);
            setRetain("");
          }}
          busy={!!busy}
          locale={locale}
        >
          {error && <p role="alert">{error}</p>}
          <p>{t("Review what will be kept or removed.", "راجع ما سيتم الاحتفاظ به أو إزالته.")}</p>
          {conversion.preview.requiresSelection && (
            <label className="studio-field">
              <span>{t("Slide to keep", "الشريحة المطلوب الاحتفاظ بها")}</span>
              <select aria-label={t("Slide to keep", "الشريحة المطلوب الاحتفاظ بها")} value={retain} onChange={(e) => setRetain(e.target.value)}>
                <option value="">{t("Choose a slide", "اختر شريحة")}</option>
                {record.mediaItems.map((item, i) => (
                  <option value={item.id} key={item.id}>
                    {i + 1}. {item.title || t("Untitled slide", "شريحة دون عنوان")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p>
            {t("Removed slides", "الشرائح المحذوفة")}:{" "}
            {conversion.preview.removedItemIds.map((id) => record.mediaItems.findIndex((i) => i.id === id) + 1).join(", ") || "—"}
          </p>
          <p>
            {t("Detached files", "الملفات المفصولة")}: {conversion.preview.detachedAssetIds.length}
          </p>
          <p>
            {t("Reset fields", "الحقول المعاد ضبطها")}: {conversion.preview.resetFields.join(", ") || "—"}
          </p>
          <button
            className="studio-button studio-button-primary"
            disabled={!!busy || (conversion.preview.requiresSelection && !retain)}
            onClick={() => void run("convert", () => convert(conversion.preview.to, !conversion.preview.requiresSelection))}
          >
            {conversion.preview.requiresSelection ? t("Review conversion", "مراجعة التحويل") : t("Confirm conversion", "تأكيد التحويل")}
          </button>
        </StudioDialog>
      )}
      {confirmation && (
        <StudioDialog title={confirmation.title} onClose={() => setConfirmation(null)} busy={!!busy} locale={locale}>
          {error && <p role="alert">{error}</p>}
          <p className="create-confirm-detail" dir="auto">
            {confirmation.detail}
          </p>
          <button
            className="studio-button studio-button-primary"
            disabled={!!busy}
            onClick={() =>
              void run("confirm", async () => {
                await confirmation.run();
                setConfirmation(null);
              })
            }
          >
            {t("Confirm", "تأكيد")}
          </button>
        </StudioDialog>
      )}
    </div>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "The action could not be completed.";
}
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
function StudioDialog({ title, onClose, busy, children, locale }: { title: string; onClose: () => void; busy: boolean; children: ReactNode; locale: Locale }) {
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, closeDisabled: busy });
  return (
    <dialog className="studio-dialog" ref={dialogRef} aria-label={title} onCancel={onCancel} onKeyDown={onKeyDown}>
      <header className="create-inline">
        <h2>{title}</h2>
        <button className="studio-button" disabled={busy} aria-label={locale === "ar" ? "إغلاق" : "Close"} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function fieldLabel(field: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    caption: ["Caption", "النص"],
    brief: ["Brief", "الموجز"],
    contentPillar: ["Content pillar", "محور المحتوى"],
    campaignGoal: ["Post objective", "هدف المنشور"],
    tone: ["Tone", "النبرة"],
    purpose: ["Purpose", "الغرض"],
    title: ["Slide title", "عنوان الشريحة"],
    body: ["Slide body", "نص الشريحة"],
    visualDirection: ["Visual direction", "التوجيه البصري"],
    aspectRatio: ["Aspect ratio", "نسبة الأبعاد"],
    generationDurationSeconds: ["Clip duration", "مدة المقطع"],
    hook: ["Hook", "المقدمة"],
    intendedDurationSeconds: ["Intended Reel duration", "مدة الريل المقصودة"],
    text: ["Beat", "المشهد"]
  };
  return labels[field]?.[ar ? 1 : 0] ?? field;
}
async function videoMetadata(file: File): Promise<{ width?: number; height?: number; durationSeconds?: number }> {
  if (!file.type.startsWith("video/")) return {};
  return new Promise((resolve, reject) => {
    const element = document.createElement("video"),
      url = URL.createObjectURL(file);
    const release = () => {
      clearTimeout(timer);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => {
      release();
      reject(new Error("Could not read video metadata."));
    }, 10000);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const metadata = { width: element.videoWidth, height: element.videoHeight, durationSeconds: Math.ceil(element.duration) };
      release();
      resolve(metadata);
    };
    element.onerror = () => {
      release();
      reject(new Error("Could not read video metadata."));
    };
    element.src = url;
  });
}
