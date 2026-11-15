"use client";
import { useEffect, useRef, useState,useCallback } from "react";
import { ArrowUp, LoaderCircle, Sparkles, Target, ImagePlus, Lightbulb, MoreHorizontal } from "lucide-react";
import { ContentReportDialog } from "./content-report-dialog";
import type { Locale, WorkspaceAssistantTurn } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import "./workspace-assistant.css";

export function WorkspaceAssistant({ locale }: { locale: Locale }) {
  const api = useMarkosClient(locale),
    session = useMarkosSession();
  const t = useCallback((en: string, ar: string) => (locale === "ar" ? ar : en),[locale]);
  const key = `markos.home-chat:${session?.user.id}:${session?.workspace.id}`;
  const [turns, setTurns] = useState<WorkspaceAssistantTurn[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState<{ requestId: string; message: string; locale: Locale } | null>(null);
  const end = useRef<HTMLDivElement>(null),
    active = turns.some((turn) => ["THINKING", "EXECUTING"].includes(turn.status));
  const [report, setReport] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? "null");
      setMessage(data?.message ?? "");
      setPending(data?.pending ?? null);
      setReady(true);
    } catch {
      setError(t("Couldn’t recover your saved message. Reload before continuing.", "تعذّر استعادة رسالتك المحفوظة. أعد تحميل الصفحة."));
    }
    const load = () =>
      api
        .workspaceAssistant()
        .then((data) => {
          if (live) {
            setTurns(data);
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
  }, [api, key,t]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns]);
  function persist(text: string, request: typeof pending) {
    localStorage.setItem(key, JSON.stringify({ message: text, pending: request }));
  }
  async function send() {
    const request = pending ?? { requestId: crypto.randomUUID(), message: message.trim(), locale };
    if (!request.message || busy || active || !ready) return;
    setBusy(true);
    setError("");
    try {
      persist(request.message, request);
      setPending(request);
      const turn = await api.messageWorkspaceAssistant(request);
      setTurns((items) => (items.some((i) => i.id === turn.id) ? items : [...items, turn]));
      persist("", null);
      setPending(null);
      setMessage("");
    } catch {
      setError(t("Message saved here. Use Retry to check this same request.", "حُفظت الرسالة هنا. أعد المحاولة للتحقّق من الطلب نفسه."));
    } finally {
      setBusy(false);
    }
  }
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
  if (session && !session.roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "EDITOR", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role)))
    return (
      <section className="workspace-chat">
        <h1>{t("Your workspace", "مساحة عملك")}</h1>
        <p>{t("Review your team’s campaigns and results.", "راجع حملات فريقك ونتائجها.")}</p>
        <a className="workspace-chat-link" href={`/${locale}/app/campaigns`}>
          {t("Open campaigns", "فتح الحملات")}
        </a>
      </section>
    );
  return (
    <section className="workspace-chat" dir={locale === "ar" ? "rtl" : "ltr"} aria-label={t("MARKOS conversation", "محادثة ماركوس")}>
      <header className="workspace-chat-welcome">
        <span className="workspace-chat-mark">
          <Sparkles size={26} />
        </span>
        <p>MARKOS</p>
        <h1>{t(`What shall we create${session?.user.fullName ? `, ${session.user.fullName.split(" ")[0]}` : ""}?`, "ماذا سنُبدع اليوم؟")}</h1>
        <p>{t("Tell me your idea. I’ll turn it into a plan, then we’ll create it together.", "أخبرني بفكرتك. سأحوّلها إلى خطة ثم نُبدعها معًا.")}</p>
      </header>
      {!turns.length && (
        <div className="workspace-chat-starters">
          {[
            {
              icon: Lightbulb,
              label: t("Build a strategy", "بناء استراتيجية"),
              text: t("Create an Instagram marketing strategy for my business.", "أنشئ استراتيجية تسويق على إنستغرام لنشاطي.")
            },
            { icon: ImagePlus, label: t("Create content", "إنشاء محتوى"), text: t("Help me create an Instagram post.", "ساعدني في إنشاء منشور لإنستغرام.") },
            {
              icon: Target,
              label: t("Plan a campaign", "تخطيط حملة"),
              text: t("Help me plan a campaign for an upcoming event or offer.", "ساعدني في تخطيط حملة لفعالية أو عرض قادم.")
            }
          ].map((s) => (
            <button
              key={s.label}
              disabled={busy || !ready}
              onClick={() => {
                setMessage(s.text);
                persist(s.text, null);
                document.getElementById("home-message")?.focus();
              }}
            >
              <s.icon size={20} />
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="workspace-chat-thread" aria-live="polite">
        {turns.map((turn, index) => (
          <div className="workspace-chat-turn" key={turn.id}>
            <p className="workspace-chat-user" dir="auto">
              {turn.message}
            </p>
            <div className="workspace-chat-reply" dir="auto">
              <span className="workspace-chat-speaker">
                <Sparkles size={16} /> MARKOS
                {turn.reply ? (
                  <button className="workspace-chat-report" aria-label={t("Report reply", "الإبلاغ عن الرد")} onClick={() => setReport(turn.id)}>
                    <MoreHorizontal size={17} />
                  </button>
                ) : null}
              </span>
              <p>{turn.reply}</p>
              {turn.status === "THINKING" && (
                <p role="status">
                  <LoaderCircle size={18} className="animate-spin" /> {t("Thinking…", "أفكّر…")}
                </p>
              )}
              {turn.proposal && turn.status === "PROPOSED" && (
                <div className="workspace-chat-plan">
                  <strong>{t("Here’s the plan", "إليك الخطة")}</strong>
                  <p>{turn.proposal.summary}</p>
                  {index === turns.length - 1 && (
                    <>
                      <button className="studio-button studio-button-primary" disabled={busy || active} onClick={() => void confirm(turn)}>
                        {t("Confirm and start", "تأكيد وبدء")}
                      </button>
                      <small>{t("Want to change something? Tell me below.", "تريد تغيير شيء؟ أخبرني أدناه.")}</small>
                    </>
                  )}
                </div>
              )}
              {turn.status === "EXECUTING" && <p role="status">{t("Starting your plan…", "أبدأ تنفيذ خطتك…")}</p>}
              {turn.contentItemId && (
                <a className="workspace-chat-link" href={`/${locale}/app/content-studio?item=${turn.contentItemId}`}>
                  {t("Open draft →", "فتح المسودة ←")}
                </a>
              )}
              {turn.campaignRequestId && (
                <a className="workspace-chat-link" href={`/${locale}/app/campaigns`}>
                  {t("Open campaigns →", "فتح الحملات ←")}
                </a>
              )}
              {turn.strategy && (
                <article className="workspace-chat-strategy">
                  {strategyLines(turn.strategy).map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </article>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="workspace-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="home-message">
          {t("Message MARKOS", "راسل ماركوس")}
        </label>
        <textarea
          id="home-message"
          rows={3}
          maxLength={4000}
          value={message}
          disabled={!ready || !!pending}
          placeholder={t("An idea, an event, or something you’d like to change…", "فكرة أو فعالية أو شيء تريد تغييره…")}
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
          {busy ? <LoaderCircle size={21} className="animate-spin" /> : <ArrowUp size={23} />}
        </button>
      </form>
      {error && (
        <p role="alert" className="workspace-chat-error">
          {error}
        </p>
      )}
      <p className="workspace-chat-note">{t("You review everything before it’s published.", "تراجع كل شيء قبل نشره.")}</p>
      {report ? <ContentReportDialog locale={locale} source="ASSISTANT_MESSAGE" sourceId={report} onClose={() => setReport(null)} /> : null}
    </section>
  );
}
function strategyLines(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strategyLines);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, v]) => (typeof v === "string" ? [`${key.replace(/_/g, " ")}: ${v}`] : strategyLines(v)));
  return [];
}
