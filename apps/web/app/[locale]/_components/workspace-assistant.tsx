"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp, MoreHorizontal, Plus, X } from "lucide-react";
import { MarkosAiIcon } from "./markos-ai-icon";
import { MarkosPulse, TaskFeedback } from "./task-feedback";
import { ContentReportDialog } from "./content-report-dialog";
import { PersonalMemoryDialog } from "./personal-memory-dialog";
import type { Locale, WorkspaceAssistantTurn } from "@markos/shared-types";
import {
  taskIntroductions,
  taskSuggestions,
  guidanceOutput,
  recommendPostTemplates,
  requestsPostDesign,
  wantsPostIdeas,
  type TaskIntent
} from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import "./workspace-assistant.css";
import { WorkspaceChats } from "./workspace-chats";
import type { WorkspaceChatSelection } from "@markos/shared-types";
import { AssistantArtifactCard } from "./assistant-artifact-card";
import { ChatPostDesign, usePostImage } from "./post-design-card";
import { savePostDesign } from "./post-design-storage";
import "./post-design.css";

export function WorkspaceAssistant(props: { locale: Locale; intent?: TaskIntent }) {
  const session = useMarkosSession();
  if (!props.intent || props.intent === "GENERAL")
    return (
      <WorkspaceChats key={`${session?.user.id}:${session?.workspace.id}`} locale={props.locale}>
        {(chat, onSent) => <WorkspaceConversation key={`${session?.user.id}:${session?.workspace.id}:${chat.id}`} {...props} chat={chat} onSent={onSent} />}
      </WorkspaceChats>
    );
  return <WorkspaceConversation key={`${session?.user.id}:${session?.workspace.id}:${props.intent ?? "GENERAL"}`} {...props} />;
}
function WorkspaceConversation({
  locale,
  intent = "GENERAL",
  chat,
  onSent
}: {
  locale: Locale;
  intent?: TaskIntent;
  chat?: WorkspaceChatSelection;
  onSent?: (id: string) => void;
}) {
  const api = useMarkosClient(locale),
    session = useMarkosSession();
  const t = useCallback((en: string, ar: string) => (locale === "ar" ? ar : en), [locale]);
  const legacyKey = `markos.home-chat:${session?.user.id}:${session?.workspace.id}${intent === "GENERAL" ? "" : `:${intent}`}`;
  const key = chat ? `${legacyKey}:chat:${chat.id}` : legacyKey;
  const chatId = chat?.id,
    newChat = chat?.isNew,
    legacyChat = chat?.legacy;
  const intro = taskIntroductions[intent],
    language = locale === "ar" ? 1 : 0;
  const [turns, setTurns] = useState<WorkspaceAssistantTurn[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState<{ requestId: string; message: string; locale: Locale; intent?: TaskIntent; chatId?: string; postDesign?: true } | null>(
      null
    );
  const supportsPostDesign = !!chat && intent === "GENERAL";
  const scope = `${session?.user.id}:${session?.workspace.id}`;
  const [designing, setDesigning] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [photo, setPhoto] = useState<File>();
  const draftPhoto = usePostImage(photo);
  const attachment = useRef<HTMLInputElement>(null);
  const [older, setOlder] = useState<WorkspaceAssistantTurn[]>([]),
    [before, setBefore] = useState<string | null>(null),
    [loadingOlder, setLoadingOlder] = useState(false);
  const loadedOlder = useRef(false);
  const end = useRef<HTMLDivElement>(null),
    active = turns.some((turn) => turn.status === "THINKING" || (turn.status === "EXECUTING" && !turn.campaign));
  const following = useRef(true);
  const [report, setReport] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [earlier, setEarlier] = useState(false);
  const combined = [...older.filter((old) => !turns.some((turn) => turn.id === old.id)), ...turns];
  const shown = intent === "GENERAL" || earlier ? combined : turns.slice(-4);
  useEffect(() => {
    let live = true;
    try {
      let raw = localStorage.getItem(key);
      if (!raw && legacyChat) {
        raw = localStorage.getItem(legacyKey);
        if (raw) {
          localStorage.setItem(key, raw);
          localStorage.removeItem(legacyKey);
        }
      }
      const data = JSON.parse(raw ?? "null");
      setMessage(data?.message ?? "");
      setPending(data?.pending ?? null);
      setReady(true);
    } catch {
      setError(t("Couldn’t recover your saved message. Reload before continuing.", "تعذّر استعادة رسالتك المحفوظة. أعد تحميل الصفحة."));
    }
    const load = () =>
      (chatId
        ? newChat
          ? Promise.resolve([])
          : api.assistantChatMessages(chatId).then((page) => {
              if (live && !loadedOlder.current) setBefore(page.nextBefore);
              return page.turns;
            })
        : api.workspaceAssistant(intent === "GENERAL" ? undefined : intent)
      )
        .then((data) => {
          if (live) {
            setTurns((previous) => (JSON.stringify(previous) === JSON.stringify(data) ? previous : data));
            setPending((p) => {
              if (p && data.some((v) => v.id === p.requestId)) {
                setMessage("");
                localStorage.removeItem(key);
                return null;
              }
              return p;
            });
          }
        })
        .catch(() => {
          if (live) setError(t("Couldn’t load your conversation. Check your connection.", "تعذّر تحميل المحادثة. تحقّق من اتصالك."));
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 2500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, key, t, intent, chatId, newChat, legacyChat, legacyKey]);
  useEffect(() => {
    if (following.current) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns]);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      following.current = entries[0]?.isIntersecting ?? true;
    });
    if (end.current) observer.observe(end.current);
    return () => observer.disconnect();
  }, []);
  function persist(text: string, request: typeof pending) {
    localStorage.setItem(key, JSON.stringify({ message: text, pending: request }));
  }
  async function send() {
    following.current = true;
    const text = message.trim();
    const postDesign = supportsPostDesign && (designing || !!photo || requestsPostDesign(text));
    const request = pending ?? {
      requestId: crypto.randomUUID(),
      message: text,
      locale,
      ...(intent === "GENERAL" ? {} : { intent }),
      ...(chat ? { chatId: chat.id } : {}),
      ...(postDesign ? { postDesign: true as const } : {})
    };
    if (!request.message || busy || active || !ready) return;
    setBusy(true);
    setError("");
    try {
      if (!pending && request.postDesign && photo) {
        await savePostDesign(`${scope}:${request.requestId}`, { stage: wantsPostIdeas(text) ? "ideas" : "style", photo, photoName: photo.name });
      }
      persist(request.message, request);
      setPending(request);
      const { postDesign: guidedPost, ...input } = request;
      const turn =
        guidedPost && input.chatId
          ? await api.beginPostDesign({ requestId: input.requestId, message: input.message, locale: input.locale, chatId: input.chatId })
          : await api.messageWorkspaceAssistant(input);
      setTurns((items) => (items.some((i) => i.id === turn.id) ? items : [...items, turn]));
      if (chat) onSent?.(chat.id);
      persist("", null);
      setPending(null);
      setMessage("");
      setPhoto(undefined);
      setDesigning(false);
      setIdeasOpen(false);
    } catch {
      setError(t("Message saved here. Use Retry to check this same request.", "حُفظت الرسالة هنا. أعد المحاولة للتحقّق من الطلب نفسه."));
    } finally {
      setBusy(false);
    }
  }
  function startPost(text: string) {
    setMessage(text);
    setDesigning(true);
    setIdeasOpen(false);
    persist(text, null);
    document.getElementById("home-message")?.focus();
  }
  const welcome = supportsPostDesign && !shown.length;
  async function confirm(turn: WorkspaceAssistantTurn) {
    if (!turn.confirmationToken) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.confirmWorkspaceAssistant(turn.id, turn.confirmationToken);
      setTurns((items) => items.map((i) => (i.id === saved.id ? saved : i)));
    } catch {
      setError(t("Couldn’t confirm this plan. Refresh the conversation before retrying.", "تعذّر تأكيد الخطة. حدّث المحادثة قبل المحاولة."));
    } finally {
      setBusy(false);
    }
  }
  async function resumeCampaign(turn: WorkspaceAssistantTurn) {
    if (!turn.campaign?.canResume) return;
    setBusy(true);
    setError("");
    try {
      await api.resumeCampaignGeneration(turn.campaign.requestId);
      setTurns(chat ? (await api.assistantChatMessages(chat.id)).turns : await api.workspaceAssistant(intent === "GENERAL" ? undefined : intent));
    } catch {
      setError(t("Couldn’t resume the saved campaign. Please try again.", "تعذّر استئناف الحملة المحفوظة. حاول مجددًا."));
    } finally {
      setBusy(false);
    }
  }
  if (session && !session.roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "EDITOR", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role)))
    return (
      <section className="workspace-chat">
        <h1>{t("Your workspace", "مساحة عملك")}</h1>
        <p>{t("Review your team’s campaigns and results.", "راجع حملات فريقك ونتائجها.")}</p>
        <a className="workspace-chat-link" href={`/${locale}/app/campaigns`}>
          {t("Open campaigns", "فتح الحملات")}
        </a>
        <button className="workspace-chat-link" onClick={() => setMemoryOpen(true)}>
          {t("What MARKOS remembers", "ما يتذكره ماركوس")}
        </button>
        {memoryOpen ? <PersonalMemoryDialog key={key} locale={locale} onClose={() => setMemoryOpen(false)} /> : null}
      </section>
    );
  return (
    <section
      className={`workspace-chat${supportsPostDesign ? " workspace-chat-post-flow" : ""}${welcome ? " workspace-chat-post-welcome" : ""}`}
      dir={locale === "ar" ? "rtl" : "ltr"}
      aria-label={t("MARKOS conversation", "محادثة ماركوس")}
    >
      {supportsPostDesign ? (
        welcome ? (
          <header className="post-chat-welcome">
            <h1>{t("Your business is ready", "نشاطك التجاري جاهز")}</h1>
            <p>{t("What would you like MARKOS to do?", "ماذا تريد من ماركوس أن يفعل؟")}</p>
            <span className="post-chat-mascot" aria-hidden />
          </header>
        ) : null
      ) : (
        <header className="workspace-chat-welcome">
          <span className="workspace-chat-mark">
            <MarkosAiIcon size={intent === "GENERAL" ? 44 : 32} />
          </span>
          {intent === "GENERAL" ? <p className="workspace-chat-eyebrow">MARKOS</p> : null}
          <h1>
            {intent === "GENERAL"
              ? t(`What shall we create${session?.user.fullName ? `, ${session.user.fullName.split(" ")[0]}` : ""}?`, "ماذا سنُبدع اليوم؟")
              : intro.title[language]}
          </h1>
          <p>{intro.detail[language]}</p>
          {intent === "GENERAL" ? (
            <button className="workspace-chat-link" onClick={() => setMemoryOpen(true)}>
              {t("What MARKOS remembers", "ما يتذكره ماركوس")}
            </button>
          ) : null}
        </header>
      )}
      {supportsPostDesign ? (
        <button className="workspace-chat-link post-memory-link" onClick={() => setMemoryOpen(true)}>
          {t("What MARKOS remembers", "ما يتذكّره ماركوس")}
        </button>
      ) : null}
      {!turns.length && (
        <div className="workspace-chat-starters">
          {supportsPostDesign ? (
            <>
              <button disabled={busy || !ready || !!pending} onClick={() => startPost(t("Design a post", "صمّم منشوراً"))}>
                {t("Design a post", "صمّم منشوراً")}
              </button>
              <button disabled={busy || !ready || !!pending} aria-expanded={ideasOpen} onClick={() => setIdeasOpen(!ideasOpen)}>
                {t("Post ideas", "أفكار منشورات")}
              </button>
            </>
          ) : null}
          {taskSuggestions[intent]
            .map((entry) => ({ label: entry[language], text: entry[language + 2]! }))
            .filter((_, index) => !supportsPostDesign || index !== 1)
            .map((s) => (
              <button
                key={s.label}
                disabled={busy || !ready}
                onClick={() => {
                  setDesigning(false);
                  setPhoto(undefined);
                  setIdeasOpen(false);
                  setMessage(s.text);
                  persist(s.text, null);
                  document.getElementById("home-message")?.focus();
                }}
              >
                {s.label}
              </button>
            ))}
        </div>
      )}
      {ideasOpen && !shown.length ? (
        <fieldset className="post-choice-card post-starter-ideas">
          <legend>{t("Pick a starting point", "اختر نقطة البداية")}</legend>
          <div className="post-choice-grid">
            {recommendPostTemplates(message).map((template) => (
              <button key={template.id} onClick={() => startPost(t(`Design a post: ${template.en}`, `صمّم منشوراً: ${template.ar}`))}>
                {t(template.en, template.ar)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {chat && before ? (
        <button
          className="workspace-chat-link"
          disabled={loadingOlder}
          onClick={() => {
            setLoadingOlder(true);
            following.current = false;
            void api
              .assistantChatMessages(chat.id, before)
              .then((page) => {
                loadedOlder.current = true;
                setOlder((old) => [...page.turns, ...old.filter((turn) => !page.turns.some((item) => item.id === turn.id))]);
                setBefore(page.nextBefore);
              })
              .catch(() => setError(t("Couldn’t load earlier messages.", "تعذّر تحميل الرسائل السابقة.")))
              .finally(() => setLoadingOlder(false));
          }}
        >
          {t("Earlier messages", "الرسائل السابقة")}
        </button>
      ) : null}
      <div className="workspace-chat-thread" aria-live="polite">
        {intent !== "GENERAL" && !earlier && turns.length > 4 ? (
          <button className="workspace-chat-link" onClick={() => setEarlier(true)}>
            {t("Earlier work", "الأعمال السابقة")}
          </button>
        ) : null}
        {shown.map((turn) => (
          <div className="workspace-chat-turn" key={turn.id}>
            <p className="workspace-chat-user" dir="auto">
              {turn.message}
            </p>
            <div className="workspace-chat-reply" dir="auto">
              <span className="workspace-chat-speaker">
                <MarkosAiIcon size={22} /> MARKOS
                {turn.reply ? (
                  <button className="workspace-chat-report" aria-label={t("Report reply", "الإبلاغ عن الرد")} onClick={() => setReport(turn.id)}>
                    <MoreHorizontal size={17} />
                  </button>
                ) : null}
              </span>
              {turn.reply && <p className="markos-reply-arrive">{turn.reply}</p>}
              {turn.status === "THINKING" && (
                <TaskFeedback label={t("Thinking through your request", "أفكّر في طلبك")} locale={locale} startedAt={turn.createdAt} />
              )}
              {turn.proposal && turn.status === "PROPOSED" && (
                <div className="workspace-chat-plan">
                  <strong>{t("Here’s the plan", "إليك الخطة")}</strong>
                  <p>{turn.proposal.summary}</p>
                  {turn.id === turns.at(-1)?.id && (
                    <>
                      <button className="studio-button studio-button-primary" disabled={busy || active} onClick={() => void confirm(turn)}>
                        {t("Confirm and start", "تأكيد وبدء")}
                      </button>
                      <small>{t("Want to change something? Tell me below.", "تريد تغيير شيء؟ أخبرني أدناه.")}</small>
                    </>
                  )}
                </div>
              )}
              {turn.status === "EXECUTING" && (
                <TaskFeedback
                  label={
                    turn.campaign || turn.proposal?.action === "CAMPAIGN"
                      ? t("Planning your campaign", "أُعدّ حملتك")
                      : turn.proposal?.action === "STRATEGY"
                        ? t("Shaping your strategy", "أصوغ استراتيجيتك")
                        : t("Preparing your draft", "أُعدّ مسودتك")
                  }
                  locale={locale}
                  progress={turn.campaign?.progress}
                  startedAt={turn.campaign?.createdAt}
                />
              )}
              {turn.postDesign && turn.contentItemId ? (
                <ChatPostDesign turn={turn} id={turn.contentItemId} storageKey={`${scope}:${turn.id}`} locale={locale} t={t} />
              ) : turn.result ? (
                <AssistantArtifactCard artifact={turn.result} locale={locale} />
              ) : null}
              {!turn.postDesign && !turn.result && turn.contentItemId && (
                <a className="workspace-chat-link" href={`/${locale}/app/content-studio?item=${turn.contentItemId}`}>
                  {t("Open draft →", "فتح المسودة ←")}
                </a>
              )}
              {!turn.result && turn.campaignId && (
                <a className="workspace-chat-link" href={`/${locale}/app/campaigns?campaign=${turn.campaignId}`}>
                  {t("Open campaign →", "فتح الحملة ←")}
                </a>
              )}
              {turn.campaign?.status === "FAILED" && (
                <div className="workspace-chat-plan">
                  <p>
                    {turn.campaign.progress
                      ? t(
                          `${turn.campaign.progress.completedWeeks} of ${turn.campaign.progress.totalWeeks} weeks saved. The campaign is not complete yet.`,
                          `تم حفظ ${turn.campaign.progress.completedWeeks} من ${turn.campaign.progress.totalWeeks} أسابيع. الحملة لم تكتمل بعد.`
                        )
                      : t("The campaign has not finished yet.", "لم يكتمل إعداد الحملة بعد.")}
                  </p>
                  {turn.campaign.canResume && (
                    <button className="studio-button studio-button-primary" disabled={busy} onClick={() => void resumeCampaign(turn)}>
                      {t("Retry remaining work", "إعادة محاولة العمل المتبقي")}
                    </button>
                  )}
                </div>
              )}
              {!turn.result && turn.strategy && (
                <>
                  <GuidanceResult value={turn.strategy} locale={locale} />
                  <a className="workspace-chat-link" href={`/${locale}/app/campaigns`}>
                    {t("Plan a campaign →", "تخطيط حملة ←")}
                  </a>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={end} className="workspace-chat-end" />
      </div>
      <form
        className="workspace-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {supportsPostDesign ? (
          <>
            <input
              ref={attachment}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("Attach reference image", "إرفاق صورة مرجعية")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 8_000_000) {
                  setError(t("Choose a JPEG, PNG, or WebP image up to 8 MB.", "اختر صورة JPEG أو PNG أو WebP بحجم لا يتجاوز ٨ ميغابايت."));
                  return;
                }
                setError("");
                setPhoto(file);
                document.getElementById("home-message")?.focus();
              }}
            />
            {photo && draftPhoto ? (
              <div className="post-chat-attachment">
                {/* The selected file is available only as a browser object URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draftPhoto} alt="" />
                <span>{photo.name}</span>
                <button type="button" disabled={!!pending || busy} aria-label={t("Remove attachment", "إزالة المرفق")} onClick={() => setPhoto(undefined)}>
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="post-attach-button"
              disabled={busy || active || !ready || !!pending}
              aria-label={t("Add reference photo to post", "إضافة صورة مرجعية للمنشور")}
              onClick={() => attachment.current?.click()}
            >
              <Plus size={21} />
            </button>
          </>
        ) : null}
        <label className="sr-only" htmlFor="home-message">
          {t("Message MARKOS", "راسل ماركوس")}
        </label>
        <textarea
          id="home-message"
          rows={supportsPostDesign ? 1 : 3}
          maxLength={4000}
          value={message}
          disabled={!ready || !!pending}
          placeholder={
            supportsPostDesign
              ? t("Ask MARKOS anything…", "اسأل ماركوس…")
              : t("An idea, an event, or something you’d like to change…", "فكرة أو فعالية أو شيء تريد تغييره…")
          }
          onChange={(e) => {
            setMessage(e.target.value);
            try {
              persist(e.target.value, null);
            } catch {
              setError(t("Couldn’t save your message on this device.", "تعذّر حفظ رسالتك على هذا الجهاز."));
            }
          }}
        />
        <button
          disabled={busy || active || !ready || !(pending?.message ?? message).trim()}
          aria-label={pending ? t("Retry message", "إعادة المحاولة") : t("Send message", "إرسال الرسالة")}
          type="submit"
        >
          {busy ? <MarkosPulse size={21} /> : <ArrowUp size={23} />}
        </button>
      </form>
      {error && (
        <p role="alert" className="workspace-chat-error">
          {error}
        </p>
      )}
      <p className="workspace-chat-note">{t("You review everything before it’s published.", "تراجع كل شيء قبل نشره.")}</p>
      {report ? <ContentReportDialog locale={locale} source="ASSISTANT_MESSAGE" sourceId={report} onClose={() => setReport(null)} /> : null}
      {memoryOpen ? <PersonalMemoryDialog key={key} locale={locale} onClose={() => setMemoryOpen(false)} /> : null}
    </section>
  );
}
export function GuidanceResult({ value, locale }: { value: Record<string, unknown>; locale: Locale }) {
  const result = guidanceOutput(value),
    ar = locale === "ar";
  return (
    <article className="workspace-chat-strategy">
      {result.summary ? <p>{result.summary}</p> : null}
      {result.sections.map((section) => (
        <details key={section.key} className="workspace-chat-plan" open={section.key === "nextActions" || section.key === "recommendations"}>
          <summary>{section.title[ar ? 1 : 0]}</summary>
          <ul>
            {section.items.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </details>
      ))}
      {result.assumptions.length || result.missingInformation.length ? (
        <details>
          <summary>{ar ? "ما زال بحاجة إلى تأكيد" : "What still needs confirming"}</summary>
          {[...result.missingInformation, ...result.assumptions].map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </details>
      ) : null}
    </article>
  );
}
