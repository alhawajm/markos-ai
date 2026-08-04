"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  Edit3,
  FileText,
  Grid,
  Hash,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Play,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  Video,
  Wand2
} from "lucide-react";
import type { ContentRecord, ContentType, Locale } from "@markos/shared-types";
import { MeteredActionNotice, quotaBlockedMessage, quotaErrorMessage, useMeteredActionState } from "./metered-action";
import { VaultGroundingNotice, useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";


type UiContentType = "reel" | "post" | "carousel" | "story";
type Icon = ComponentType<{ color?: string; className?: string; size?: number; strokeWidth?: number }>;

interface GeneratedContent {
  body: string;
  caption: string;
  cta: string;
  hashtags: string[];
  hook: string;
  id?: string;
}

const contentTypes: Array<{ badgeKey?: string; descKey: string; icon: Icon; id: UiContentType; labelKey: string }> = [
  { id: "reel", labelKey: "reelScript", icon: Video, descKey: "hookBodyCta", badgeKey: "top" },
  { id: "post", labelKey: "imagePost", icon: ImageIcon, descKey: "captionHashtags" },
  { id: "carousel", labelKey: "carousel", icon: Grid, descKey: "multiSlide" },
  { id: "story", labelKey: "story", icon: Smartphone, descKey: "ephemeral" }
];

const tones = ["Professional", "Casual & Fun", "Inspiring", "Urgent", "Luxurious"];
const presetPrompts = ["Ramadan offer", "5G speed", "Student plan", "Family bundle"];
const hashtagLibrary = ["#Bahrain", "#ZainBH", "#Connectivity", "#5GBahrain", "#TelecomBH", "#DigitalBahrain", "#GCC", "#BahrainBusiness"];

const initialContent: GeneratedContent = {
  hook: "Did you know 73% of Bahraini businesses lose customers because their connectivity cannot keep up?",
  body: "Your internet should not slow growth. Zain Bahrain gives teams reliable 5G coverage, business support, and fast setup for every branch, counter, and office.",
  cta: "Explore Zain Business plans today and give your team the speed to move first.",
  caption: "Bahrain runs on connection, and so does your business. Zain Bahrain helps teams stay fast, reliable, and ready for every customer moment.",
  hashtags: ["#ZainBH", "#Bahrain", "#5G"]
};

export function ContentPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [contentType, setContentType] = useState<UiContentType>("reel");
  const [prompt, setPrompt] = useState(contentCopy(locale, "defaultPrompt"));
  const [tone, setTone] = useState("Casual & Fun");
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>(initialContent.hashtags);
  const [message, setMessage] = useState("");
  const vaultGrounding = useVaultGroundingState({ area: "content", locale });
  const aiUsage = useMeteredActionState({
    fallbackTotal: 1000,
    fallbackUsed: 680,
    label: locale === "ar" ? "توليدات الذكاء" : "AI generations",
    metric: "AI_GENERATION"
  });

  const client = useMarkosClient(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previewType = params.get("type");
    const requestedType = isUiContentType(previewType) ? previewType : null;
    if (requestedType) {
      setContentType(requestedType);
    }
    if (params.get("state") === "generated") {
      const nextType = requestedType ?? "reel";
      setGenerated(mockGeneratedContent(nextType, contentCopy(locale, "defaultPrompt"), locale));
      setAccepted(params.get("accepted") === "1");
    }
  }, [locale]);

  async function generate() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setMessage(contentCopy(locale, "promptRequired"));
      return;
    }

    if (vaultGrounding.blocked) {
      setMessage(vaultGapMessage(locale));
      return;
    }

    if (aiUsage.blocked) {
      setMessage(quotaBlockedMessage(locale));
      return;
    }

    setGenerating(true);
    setGenerated(null);
    setAccepted(false);
    setMessage("");

    try {
      if (!session) {
        setGenerated(mockGeneratedContent(contentType, trimmedPrompt, locale));
        setMessage(contentCopy(locale, "previewMode"));
        return;
      }

      const drafts = await client.generateContent({
        contentType: toApiContentType(contentType),
        count: 1,
        topic: trimmedPrompt
      });
      const firstDraft = drafts[0];
      setGenerated(firstDraft ? generatedFromRecord(firstDraft, trimmedPrompt) : mockGeneratedContent(contentType, trimmedPrompt, locale));
      setMessage(firstDraft ? contentCopy(locale, "draftSaved") : contentCopy(locale, "draftGenerated"));
    } catch (error) {
      const quotaMessage = quotaErrorMessage(locale, error);
      if (quotaMessage) {
        setMessage(quotaMessage);
        return;
      }

      setGenerated(mockGeneratedContent(contentType, trimmedPrompt, locale));
      setMessage(error instanceof Error ? `${contentCopy(locale, "localPreview")} ${error.message}` : contentCopy(locale, "localPreview"));
    } finally {
      setGenerating(false);
    }
  }

  async function accept() {
    setAccepted(true);

    if (session && generated?.id) {
      try {
        await client.updateContentStatus(generated.id, "APPROVED");
        setMessage(contentCopy(locale, "acceptedApproved"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : contentCopy(locale, "acceptedLocal"));
      }
    } else {
      setMessage(contentCopy(locale, "accepted"));
    }
  }

  async function copyContent() {
    await writeClipboard(formatGeneratedContent(content, selectedHashtags));
    setMessage(contentCopy(locale, "copied"));
  }

  async function shareContent() {
    const shareText = formatGeneratedContent(content, selectedHashtags);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await navigator.share({ text: shareText, title: "MARKOS AI" });
      setMessage(contentCopy(locale, "shared"));
      return;
    }

    await writeClipboard(shareText);
    setMessage(contentCopy(locale, "shareCopied"));
  }

  function scheduleAccepted() {
    window.localStorage.setItem(
      "markos.acceptedContent",
      JSON.stringify({
        content,
        contentType,
        savedAt: new Date().toISOString(),
        selectedHashtags
      })
    );
    window.location.assign(`/${locale}/schedule?from=content`);
  }

  const content = generated ?? initialContentForLocale(locale);

  return (
    <section className="flex min-h-[calc(100vh-120px)] gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section className="rounded-2xl border border-[#E8ECF2] bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,.04)]">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[.08em] text-[#9CA3AF]">{contentCopy(locale, "contentType")}</p>
          <div className="grid gap-2.5 md:grid-cols-4">
            {contentTypes.map(({ badgeKey, descKey, icon: IconComponent, id, labelKey }) => {
              const active = contentType === id;

              return (
                <button
                  className="relative rounded-xl p-3.5 text-left transition"
                  key={id}
                  onClick={() => {
                    setContentType(id);
                    setGenerated(null);
                    setAccepted(false);
                  }}
                  style={{
                    background: active ? "rgba(233,69,96,0.05)" : "#F8FAFC",
                    border: `1.5px solid ${active ? "#E94560" : "#E8ECF2"}`,
                    boxShadow: active ? "0 4px 14px rgba(233,69,96,0.12)" : "none",
                    transform: active ? "translateY(-1px)" : "none"
                  }}
                  type="button"
                >
                  {badgeKey ? <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">{contentCopy(locale, badgeKey)}</span> : null}
                  <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: active ? "rgba(233,69,96,0.1)" : "#EAECF0" }}>
                    <IconComponent color={active ? "#E94560" : "#6B7280"} size={16} strokeWidth={1.5} />
                  </div>
                  <p className="text-[13px] font-bold" style={{ color: active ? "#E94560" : "#374151" }}>{contentCopy(locale, labelKey)}</p>
                  <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{contentCopy(locale, descKey)}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.04)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#9CA3AF]">{contentCopy(locale, "aiPrompt")}</p>
            <label className="flex items-center gap-2">
              <span className="text-xs text-[#9CA3AF]">{contentCopy(locale, "tone")}:</span>
              <span className="relative">
                <select
                  className="appearance-none rounded-lg border border-[#E2E8F0] bg-canvas py-1.5 pl-3 pr-7 text-xs font-semibold text-[#374151] outline-none"
                  onChange={(event) => setTone(event.target.value)}
                  value={tone}
                >
                  {tones.map((option) => <option key={option}>{option}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={11} />
              </span>
            </label>
          </div>

          <div className="relative">
            <textarea
              className="min-h-[132px] w-full resize-none rounded-xl border border-[#E8ECF2] bg-canvas px-4 py-3 text-sm leading-7 text-[#374151] outline-none focus:border-accent"
              maxLength={500}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={contentCopy(locale, "promptPlaceholder")}
              rows={3}
              value={prompt}
            />
            <span className="absolute bottom-3 right-3 text-[10px] text-[#C4C9D4]">{prompt.length}/500</span>
          </div>

          <div className="mt-3">
            <MeteredActionNotice locale={locale} usage={aiUsage} />
          </div>
          <div className="mt-3">
            <VaultGroundingNotice locale={locale} state={vaultGrounding} />
          </div>

          <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {presetPrompts.map((preset) => (
                <button
                  className="rounded-full border border-[#E2E8F0] bg-slate-100 px-2.5 py-1 text-[11px] text-[#6B7280] transition hover:border-accent/40"
                  key={preset}
                  onClick={() => setPrompt(contentCopy(locale, "presetPrompt").replace("{type}", contentCopy(locale, contentType)).replace("{preset}", preset).replace("{tone}", tone))}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>
            <button
              className="inline-flex min-w-[170px] items-center justify-center gap-2.5 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_3px_12px_rgba(233,69,96,.35)] transition hover:opacity-90 disabled:opacity-60"
              disabled={generating || aiUsage.blocked || vaultGrounding.blocked}
              onClick={generate}
              type="button"
            >
              {generating ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} strokeWidth={2} />}
              {generating ? contentCopy(locale, "generating") : contentCopy(locale, "generateWithAi")}
            </button>
          </div>
          <p className="mt-3 min-h-5 text-xs text-muted">{message}</p>
        </section>

        <OutputPanel
          accepted={accepted}
          content={content}
          contentType={contentType}
          editMode={editMode}
          generated={Boolean(generated)}
          generating={generating}
          locale={locale}
          onAccept={accept}
          onCopy={copyContent}
          onEditMode={() => setEditMode((current) => !current)}
          onGenerate={generate}
          onShare={shareContent}
          selectedHashtags={selectedHashtags}
          setContent={setGenerated}
          setSelectedHashtags={setSelectedHashtags}
        />
      </div>

      <aside className="hidden w-[300px] shrink-0 xl:block">
        <div className="sticky top-4">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone size={15} className="text-muted" strokeWidth={1.5} />
            <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">Live Preview</span>
            <div className="h-px flex-1 bg-[#E8ECF2]" />
          </div>
          <PhonePreview content={content} contentType={contentType} locale={locale} />
          <PublishControls accepted={accepted} locale={locale} onSchedule={scheduleAccepted} />
        </div>
      </aside>
    </section>
  );
}

function OutputPanel({
  accepted,
  content,
  contentType,
  editMode,
  generated,
  generating,
  locale,
  onAccept,
  onCopy,
  onEditMode,
  onGenerate,
  onShare,
  selectedHashtags,
  setContent,
  setSelectedHashtags
}: {
  accepted: boolean;
  content: GeneratedContent;
  contentType: UiContentType;
  editMode: boolean;
  generated: boolean;
  generating: boolean;
  locale: Locale;
  onAccept: () => void;
  onCopy: () => void;
  onEditMode: () => void;
  onGenerate: () => void;
  onShare: () => void;
  selectedHashtags: string[];
  setContent: (content: GeneratedContent) => void;
  setSelectedHashtags: (hashtags: string[]) => void;
}) {
  if (generating) {
    return (
      <section className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.04)]">
        <div className="rounded-xl border border-slate-100 bg-canvas p-5">
          <div className="mb-4 flex items-center gap-2">
            {[0, 1, 2].map((index) => <span className="h-2 w-2 animate-pulse rounded-full bg-accent" key={index} />)}
            <span className="text-xs text-[#9CA3AF]">{contentCopy(locale, "writing")}</span>
          </div>
          {[90, 75, 85, 60, 70].map((width) => (
            <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-slate-200" key={width} style={{ width: `${width}%` }}>
              <div className="h-full animate-pulse bg-slate-300" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!generated) {
    return (
      <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8DEE9] bg-card p-12 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/15 bg-[linear-gradient(135deg,rgba(233,69,96,.08),rgba(99,102,241,.06))]">
          <Wand2 color="#E94560" size={26} strokeWidth={1.5} />
        </div>
        <p className="text-base font-bold text-[#374151]">{contentCopy(locale, "readyToCreate")}</p>
        <p className="mt-1 max-w-[280px] text-[13px] leading-6 text-[#9CA3AF]">{contentCopy(locale, "readyBody")}</p>
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-accent/10 bg-accent/5 px-4 py-2.5">
          <Sparkles color="#E94560" size={13} strokeWidth={2} />
          <span className="text-xs font-semibold text-accent">{contentCopy(locale, "learnsVoice")}</span>
        </div>
      </section>
    );
  }

  return (
    <section className={accepted ? "rounded-2xl border border-emerald-300 bg-card p-5 shadow-[0_0_0_2px_rgba(34,197,94,.12)]" : "rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] p-0.5 shadow-[0_6px_28px_rgba(233,69,96,.15)]"}>
      <div className="rounded-2xl bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={accepted ? "flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50" : "flex h-8 w-8 items-center justify-center rounded-xl border border-accent/20 bg-accent/10"}>
              {accepted ? <Check color="#22C55E" size={15} strokeWidth={2.5} /> : <Sparkles color="#E94560" size={15} strokeWidth={2} />}
            </div>
            <div>
              <p className="text-[13px] font-extrabold text-navy">{accepted ? contentCopy(locale, "contentAccepted") : contentCopy(locale, "aiGeneratedContent")}</p>
              {!accepted ? <p className="text-[10px] text-[#9CA3AF]">{contentCopy(locale, "reviewBeforeSchedule")}</p> : null}
            </div>
            {!accepted ? <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-extrabold text-accent"><Sparkles size={8} strokeWidth={3} /> AI</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-canvas px-3 py-1.5 text-xs text-[#374151]" onClick={onCopy} type="button">
              <Copy size={12} />
              {contentCopy(locale, "copy")}
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-canvas px-3 py-1.5 text-xs text-[#374151]" onClick={onShare} type="button">
              <Send size={12} />
              {contentCopy(locale, "share")}
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-canvas px-3 py-1.5 text-xs text-[#374151]" onClick={onEditMode} type="button">
              <Edit3 size={12} />
              {editMode ? contentCopy(locale, "preview") : contentCopy(locale, "edit")}
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-canvas px-3 py-1.5 text-xs text-[#374151]" onClick={onGenerate} type="button">
              <RefreshCw size={12} />
              {contentCopy(locale, "regenerate")}
            </button>
            {!accepted ? (
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-[0_2px_8px_rgba(34,197,94,.3)]" onClick={onAccept} type="button">
                <Check size={12} strokeWidth={2.5} />
                {contentCopy(locale, "accept")}
              </button>
            ) : null}
          </div>
        </div>

        {editMode ? <EditableContent content={content} locale={locale} onChange={setContent} /> : <GeneratedPreview accepted={accepted} content={content} contentType={contentType} locale={locale} />}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2.5 flex items-center gap-2">
            <Hash size={13} color="#9CA3AF" />
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-[#9CA3AF]">{contentCopy(locale, "hashtagLibrary")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hashtagLibrary.map((hashtag) => {
              const selected = selectedHashtags.includes(hashtag);
              return (
                <button
                  className="rounded-full px-3 py-1 text-xs transition"
                  key={hashtag}
                  onClick={() => setSelectedHashtags(selected ? selectedHashtags.filter((item) => item !== hashtag) : [...selectedHashtags, hashtag])}
                  style={{
                    background: selected ? "rgba(15,52,96,0.1)" : "#F1F5F9",
                    border: `1px solid ${selected ? "#0F3460" : "#E2E8F0"}`,
                    color: selected ? "#0F3460" : "#6B7280",
                    fontWeight: selected ? 700 : 400
                  }}
                  type="button"
                >
                  {hashtag}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function EditableContent({ content, locale, onChange }: { content: GeneratedContent; locale: Locale; onChange: (content: GeneratedContent) => void }) {
  return (
    <div className="grid gap-3">
      {([
        ["hook", contentCopy(locale, "hook"), 2],
        ["body", contentCopy(locale, "body"), 5],
        ["cta", contentCopy(locale, "cta"), 2]
      ] as const).map(([key, label, rows]) => (
        <label key={key}>
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-accent">{label}</span>
          <textarea
            className="mt-2 w-full resize-none rounded-xl border border-accent/20 bg-accent/[.03] px-4 py-3 text-sm leading-7 text-[#374151] outline-none focus:border-accent"
            onChange={(event) => onChange({ ...content, [key]: event.target.value })}
            rows={rows}
            value={content[key]}
          />
        </label>
      ))}
    </div>
  );
}

function GeneratedPreview({
  accepted,
  content,
  contentType,
  locale
}: {
  accepted: boolean;
  content: GeneratedContent;
  contentType: UiContentType;
  locale: Locale;
}) {
  if (contentType === "carousel") {
    return (
      <div className="rounded-xl border p-5" style={{ background: accepted ? "#F0FDF4" : "linear-gradient(135deg,rgba(233,69,96,.03),rgba(99,102,241,.03))", borderColor: accepted ? "rgba(34,197,94,.2)" : "rgba(233,69,96,.12)" }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-accent">{contentCopy(locale, "carouselBuilder")}</span>
          <span className="text-[11px] text-[#9CA3AF]">{contentCopy(locale, "slidesReady").replace("{count}", String(carouselSlides(content, locale).length))}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {carouselSlides(content, locale).map((slide, index) => (
            <article className="min-h-[150px] rounded-2xl border border-accent/10 bg-white p-4 shadow-sm" key={slide.title}>
              <p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-accent">{contentCopy(locale, "slide")} {index + 1}</p>
              <h4 className="mt-3 text-sm font-extrabold leading-6 text-navy">{slide.title}</h4>
              <p className="mt-2 text-xs leading-6 text-muted">{slide.body}</p>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (contentType === "story") {
    return (
      <div className="rounded-xl border p-5" style={{ background: accepted ? "#F0FDF4" : "linear-gradient(135deg,rgba(233,69,96,.03),rgba(99,102,241,.03))", borderColor: accepted ? "rgba(34,197,94,.2)" : "rgba(233,69,96,.12)" }}>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div className="relative min-h-[320px] overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#0F3460,#1A1A2E)] p-5 text-white">
            <div className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative">
              <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold">{contentCopy(locale, "story")}</span>
              <h4 className="mt-12 font-display text-2xl font-extrabold leading-tight tracking-normal">{truncate(content.hook, 68)}</h4>
              <p className="mt-5 text-sm leading-7 text-white/70">{truncate(content.cta, 92)}</p>
              <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4 text-center text-sm font-extrabold backdrop-blur">{contentCopy(locale, "tapToReply")}</div>
            </div>
          </div>
          <div className="grid content-center gap-3">
            <ContentSection color="#E94560" label={contentCopy(locale, "storyFrame")} meta={contentCopy(locale, "firstFrame")} text={content.hook} strong />
            <ContentSection color="#2563EB" label={contentCopy(locale, "sticker")} meta={contentCopy(locale, "replyPrompt")} text={content.cta} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 rounded-xl border p-5" style={{ background: accepted ? "#F0FDF4" : "linear-gradient(135deg,rgba(233,69,96,.03),rgba(99,102,241,.03))", borderColor: accepted ? "rgba(34,197,94,.2)" : "rgba(233,69,96,.12)" }}>
      {!accepted ? <Sparkles className="absolute right-4 top-4 opacity-15" color="#E94560" size={20} /> : null}
      <ContentSection color="#CA8A04" label={contentCopy(locale, "hook")} meta={contentCopy(locale, contentType === "post" ? "captionLead" : "firstSeconds")} text={contentType === "post" ? content.caption : content.hook} strong />
      <div className="h-px bg-accent/10" />
      <ContentSection color="#2563EB" label={contentCopy(locale, "body")} meta={contentCopy(locale, "mainMessage")} text={content.body} />
      <div className="h-px bg-accent/10" />
      <ContentSection color="#E94560" label={contentCopy(locale, "cta")} meta={contentCopy(locale, "callToAction")} text={content.cta} strong />
    </div>
  );
}

function ContentSection({ color, label, meta, strong, text }: { color: string; label: string; meta: string; strong?: boolean; text: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em]" style={{ background: `${color}18`, color }}>{label}</span>
        <span className="text-[11px] text-[#9CA3AF]">{meta}</span>
      </div>
      <p className={strong ? "text-sm font-bold leading-7 text-navy" : "text-[13px] leading-7 text-[#374151]"}>{text}</p>
    </div>
  );
}

function PhonePreview({ content, contentType, locale }: { content: GeneratedContent; contentType: UiContentType; locale: Locale }) {
  const slides = carouselSlides(content, locale);

  return (
    <div className="mx-auto overflow-hidden rounded-[36px] border-[10px] border-[#141414] bg-black shadow-[0_30px_70px_rgba(0,0,0,.35)]" style={{ width: 284 }}>
      <div className="relative bg-white px-5 pb-1.5 pt-7">
        <div className="absolute left-1/2 top-0 h-6 w-[100px] -translate-x-1/2 rounded-b-2xl bg-black" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-black">9:41</span>
          <MoreHorizontal size={16} color="#000" />
        </div>
      </div>

      <div className="border-b border-neutral-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-[linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)] p-0.5">
              <div className="rounded-full bg-white p-[2px]">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,#E94560,#0F3460)] text-[9px] font-extrabold text-white">ZB</div>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-black">zain_bh</p>
              <p className="text-[10px] text-neutral-500">Bahrain - Telecom</p>
            </div>
          </div>
          <MoreHorizontal size={16} color="#000" />
        </div>
      </div>

      <div className="relative h-[264px] overflow-hidden bg-[linear-gradient(180deg,#0F3460_0%,#1A1A2E_60%,#0a0a14_100%)]">
        <div className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:18px_18px]" />
        {contentType === "reel" ? (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,.75))]" />
            <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/15 backdrop-blur">
              <Play color="#fff" fill="white" size={18} />
            </div>
            <div className="absolute bottom-3 left-3 right-11">
              <p className="text-[11px] font-bold leading-5 text-white">{truncate(content.hook, 70)}</p>
              <p className="mt-1 text-[10px] text-white/60">zain_bh</p>
            </div>
            <div className="absolute bottom-5 right-2.5 grid gap-3.5 text-center text-white">
              <PreviewAction icon={Heart} label="12.4K" />
              <PreviewAction icon={MessageCircle} label="847" />
              <PreviewAction icon={Send} label="Share" />
            </div>
          </>
        ) : contentType === "carousel" ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="w-full rounded-3xl bg-white/95 p-4 text-left shadow-[0_18px_40px_rgba(0,0,0,.25)]">
              <p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-accent">{contentCopy(locale, "slide")} 1/{slides.length}</p>
              <h4 className="mt-3 text-xl font-extrabold leading-tight text-navy">{slides[0]?.title}</h4>
              <p className="mt-3 text-xs leading-5 text-muted">{slides[0]?.body}</p>
              <div className="mt-4 flex justify-center gap-1.5">
                {slides.map((slide, index) => <span className={index === 0 ? "h-1.5 w-5 rounded-full bg-accent" : "h-1.5 w-1.5 rounded-full bg-slate-300"} key={slide.title} />)}
              </div>
            </div>
          </div>
        ) : contentType === "story" ? (
          <div className="flex h-full flex-col justify-between px-5 py-6 text-white">
            <div className="flex gap-1">
              {[0, 1, 2].map((item) => <span className={item === 0 ? "h-0.5 flex-1 rounded-full bg-white" : "h-0.5 flex-1 rounded-full bg-white/30"} key={item} />)}
            </div>
            <div>
              <p className="rounded-full bg-white/15 px-3 py-1 text-center text-[10px] font-bold backdrop-blur">{contentCopy(locale, "story")}</p>
              <h4 className="mt-5 text-center font-display text-2xl font-extrabold leading-tight tracking-normal">{truncate(content.hook, 68)}</h4>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3 text-center text-xs font-bold backdrop-blur">{contentCopy(locale, "tapToReply")}</div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <div>
              <p className="font-display text-[22px] font-extrabold leading-tight tracking-normal text-white">ZAIN<br />SUMMER</p>
              <p className="mt-2 text-[11px] text-white/70">Unlimited - Bahrain</p>
              <p className="mx-auto mt-4 w-fit rounded-full bg-white/15 px-4 py-1.5 text-[10px] font-bold text-white backdrop-blur">BD 18/month</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
          <div className="flex gap-4">
            <Heart color="#000" size={21} strokeWidth={1.5} />
            <MessageCircle color="#000" size={21} strokeWidth={1.5} />
            <Send color="#000" size={21} strokeWidth={1.5} />
          </div>
          <Bookmark color="#000" size={21} strokeWidth={1.5} />
        </div>
        <div className="px-3 py-1.5 text-[11px] font-bold text-black">12,419 likes</div>
        <p className="px-3 pb-3 text-[11px] leading-5 text-black">
          <span className="font-bold">zain_bh </span>
          {truncate(contentType === "reel" ? content.hook : content.caption, 82)}
        </p>
        <p className="px-3 pb-3 text-[10px] text-neutral-500">View all 284 comments</p>
      </div>
    </div>
  );
}

function PreviewAction({ icon: IconComponent, label }: { icon: Icon; label: string }) {
  return (
    <div>
      <IconComponent color="#fff" size={20} />
      <p className="mt-0.5 text-[9px] font-bold">{label}</p>
    </div>
  );
}

function PublishControls({ accepted, locale, onSchedule }: { accepted: boolean; locale: Locale; onSchedule: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border border-[#E8ECF2] bg-card p-4">
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-[#9CA3AF]">{contentCopy(locale, "publishTo")}</p>
      <div className="mb-3 flex gap-2">
        {[
          { active: true, background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743)", label: "IG" },
          { active: false, background: "#F8FAFC", label: "FB" },
          { active: false, background: "#F8FAFC", label: "X" }
        ].map(({ active, background, label }) => (
          <button
            className="flex-1 rounded-xl py-2 text-xs font-extrabold"
            key={label}
            style={{ background, border: active ? "none" : "1px solid #E2E8F0", color: active ? "#fff" : "#9CA3AF" }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" disabled={!accepted} onClick={accepted ? onSchedule : undefined} style={{ background: accepted ? "linear-gradient(135deg,#E94560,#c9314e)" : "#F1F5F9", color: accepted ? "#fff" : "#9CA3AF", boxShadow: accepted ? "0 4px 18px rgba(233,69,96,.3)" : "none" }} type="button">
        {accepted ? contentCopy(locale, "schedulePost") : contentCopy(locale, "acceptFirst")}
        {accepted ? <ArrowRight size={14} /> : null}
      </button>
    </div>
  );
}

function toApiContentType(contentType: UiContentType): ContentType {
  switch (contentType) {
    case "reel":
      return "REEL";
    case "carousel":
      return "CAROUSEL";
    case "story":
      return "STORY";
    case "post":
    default:
      return "POST";
  }
}

function isUiContentType(value: string | null): value is UiContentType {
  return value === "reel" || value === "post" || value === "carousel" || value === "story";
}

function generatedFromRecord(item: ContentRecord, fallbackPrompt: string): GeneratedContent {
  const reelScript = isRecord(item.reelScript) ? item.reelScript : {};
  const hook = readString(reelScript, "hook") ?? item.captionEn ?? fallbackPrompt;
  const body = readString(reelScript, "body") ?? item.captionEn ?? initialContent.body;
  const cta = item.callToAction ?? readString(reelScript, "cta") ?? initialContent.cta;

  return {
    body,
    caption: item.captionEn ?? item.captionAr ?? body,
    cta,
    hashtags: item.hashtags.length ? item.hashtags : initialContent.hashtags,
    hook,
    id: item.id
  };
}

function initialContentForLocale(locale: Locale): GeneratedContent {
  if (locale === "ar") {
    return {
      hook: "هل تعلم أن كثيرا من الأعمال في البحرين تخسر فرصا عندما لا تواكب سرعة الاتصال احتياج العملاء؟",
      body: "اتصالك يجب أن يدعم نموك، لا أن يبطئه. زين البحرين تمنح فرق العمل تغطية 5G موثوقة، ودعما للأعمال، وتجهيزا سريعا لكل فرع ومكتب ونقطة بيع.",
      cta: "استكشف باقات زين للأعمال اليوم واجعل فريقك أسرع في خدمة العملاء.",
      caption: "الأعمال في البحرين تتحرك بسرعة، وزين البحرين تساعد فريقك على البقاء متصلا وجاهزا لكل لحظة عميل.",
      hashtags: initialContent.hashtags
    };
  }

  return initialContent;
}

function mockGeneratedContent(contentType: UiContentType, prompt: string, locale: Locale): GeneratedContent {
  const lead = prompt.replace(/\s+/g, " ").trim();
  const baseContent = initialContentForLocale(locale);

  if (contentType === "post") {
    return {
      ...baseContent,
      caption: locale === "ar"
        ? `${lead} زين البحرين تبقي العملاء متصلين بخدمات رقمية موثوقة للحياة اليومية ونمو الأعمال.`
        : `${lead} Zain Bahrain keeps customers connected with reliable digital services built for everyday life and business growth.`,
      hook: lead
    };
  }

  return {
    ...baseContent,
    hook: lead,
    body: baseContent.body,
    cta: baseContent.cta
  };
}

function carouselSlides(content: GeneratedContent, locale: Locale): Array<{ body: string; title: string }> {
  return [
    { title: content.hook, body: contentCopy(locale, "slideOneBody") },
    { title: contentCopy(locale, "slideTwoTitle"), body: content.body },
    { title: contentCopy(locale, "slideThreeTitle"), body: content.cta }
  ];
}

function formatGeneratedContent(content: GeneratedContent, hashtags: string[]): string {
  return [
    `Hook: ${content.hook}`,
    `Body: ${content.body}`,
    `CTA: ${content.cta}`,
    `Caption: ${content.caption}`,
    hashtags.length ? `Hashtags: ${hashtags.join(" ")}` : ""
  ].filter(Boolean).join("\n\n");
}

async function writeClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function contentCopy(locale: Locale, key: string): string {
  const dictionary = {
    ar: {
      accept: "اعتماد",
      acceptFirst: "اعتمد المحتوى أولا",
      accepted: "تم اعتماد المحتوى.",
      acceptedApproved: "تم اعتماد المحتوى وحفظه كجاهز للمراجعة.",
      acceptedLocal: "تم اعتماد المحتوى محليا.",
      aiGeneratedContent: "محتوى مولد بالذكاء",
      aiPrompt: "موجه الذكاء",
      body: "النص",
      callToAction: "دعوة لاتخاذ إجراء",
      captionHashtags: "كابشن + هاشتاقات",
      captionLead: "بداية الكابشن",
      carousel: "كاروسيل",
      carouselBuilder: "منشئ الكاروسيل",
      contentAccepted: "تم اعتماد المحتوى",
      contentType: "نوع المحتوى",
      copied: "تم نسخ المحتوى.",
      copy: "نسخ",
      cta: "CTA",
      defaultPrompt: "أنشئ سكربت ريل لباقة بيانات صيفية غير محدودة تستهدف الشباب المهنيين في البحرين. اجعله نشطا وقريبا من الجمهور.",
      draftGenerated: "تم توليد المسودة.",
      draftSaved: "تم توليد المسودة وحفظها في مساحة العمل.",
      edit: "تعديل",
      ephemeral: "مؤقت 24 ساعة",
      firstFrame: "الإطار الأول",
      firstSeconds: "أول 3 ثوان",
      generateWithAi: "ولّد بالذكاء",
      generating: "جاري التوليد...",
      hashtagLibrary: "مكتبة الهاشتاقات",
      hook: "الخطاف",
      hookBodyCta: "خطاف - نص - CTA",
      imagePost: "منشور صورة",
      learnsVoice: "MARKOS يتعلم نبرة علامتك مع الوقت",
      localPreview: "تم توليد معاينة محلية. ملاحظة API:",
      mainMessage: "الرسالة الرئيسية",
      multiSlide: "قصة متعددة الشرائح",
      post: "منشور",
      presetPrompt: "أنشئ {type} عن {preset} لـ Zain Bahrain. النبرة: {tone}.",
      preview: "معاينة",
      previewMode: "وضع المعاينة: سجل الدخول لحفظ المسودات في مساحة العمل.",
      promptPlaceholder: "صف ما تريد أن ينشئه MARKOS...",
      promptRequired: "اكتب موجها قبل توليد المحتوى.",
      publishTo: "النشر إلى",
      readyBody: "اختر نوع المحتوى، اكتب أو اختر موجها، ثم اضغط ولّد بالذكاء",
      readyToCreate: "جاهز للإنشاء",
      regenerate: "إعادة توليد",
      reel: "ريل",
      reelScript: "سكربت ريل",
      replyPrompt: "دعوة للرد",
      reviewBeforeSchedule: "راجع واعتمد قبل الجدولة",
      schedulePost: "جدولة المنشور",
      share: "مشاركة",
      shareCopied: "المشاركة غير متاحة هنا، وتم نسخ المحتوى بدلا من ذلك.",
      shared: "تم فتح المشاركة.",
      slide: "شريحة",
      slideOneBody: "ابدأ بنقطة ألم واضحة واجعل التمرير مهما من أول لحظة.",
      slideThreeTitle: "جاهز للتحرك",
      slideTwoTitle: "الطريقة الأفضل",
      slidesReady: "{count} شرائح جاهزة",
      sticker: "ملصق تفاعلي",
      story: "ستوري",
      storyFrame: "إطار الستوري",
      tapToReply: "اضغط للرد",
      top: "الأفضل",
      tone: "النبرة",
      writing: "MARKOS يكتب المحتوى..."
    },
    en: {
      accept: "Accept",
      acceptFirst: "Accept content first",
      accepted: "Content accepted.",
      acceptedApproved: "Content accepted and marked approved.",
      acceptedLocal: "Content accepted locally.",
      aiGeneratedContent: "AI Generated Content",
      aiPrompt: "AI Prompt",
      body: "Body",
      callToAction: "Call to action",
      captionHashtags: "Caption + Hashtags",
      captionLead: "Caption lead",
      carousel: "Carousel",
      carouselBuilder: "Carousel Builder",
      contentAccepted: "Content Accepted",
      contentType: "Content Type",
      copied: "Content copied.",
      copy: "Copy",
      cta: "CTA",
      defaultPrompt: "Create a reel script for our new summer unlimited data plan targeting young professionals in Bahrain. Make it energetic and relatable.",
      draftGenerated: "Draft generated.",
      draftSaved: "Draft generated and saved to the workspace.",
      edit: "Edit",
      ephemeral: "24h ephemeral",
      firstFrame: "First frame",
      firstSeconds: "First 3 seconds",
      generateWithAi: "Generate with AI",
      generating: "Generating...",
      hashtagLibrary: "Hashtag Library",
      hook: "Hook",
      hookBodyCta: "Hook - Body - CTA",
      imagePost: "Image Post",
      learnsVoice: "MARKOS learns your brand voice over time",
      localPreview: "Preview generated locally. API note:",
      mainMessage: "Main message",
      multiSlide: "Multi-slide story",
      post: "content",
      presetPrompt: "Create {type} about {preset} for Zain Bahrain. Tone: {tone}.",
      preview: "Preview",
      previewMode: "Preview mode: sign in to save generated drafts to the workspace.",
      promptPlaceholder: "Describe what you want MARKOS to create...",
      promptRequired: "Write a prompt before generating content.",
      publishTo: "Publish to",
      readyBody: "Choose a content type, write or pick a prompt, then click Generate with AI",
      readyToCreate: "Ready to create",
      regenerate: "Regenerate",
      reel: "a reel script",
      reelScript: "Reel Script",
      replyPrompt: "Reply prompt",
      reviewBeforeSchedule: "Review and accept before scheduling",
      schedulePost: "Schedule Post",
      share: "Share",
      shareCopied: "Share is unavailable here, so the content was copied instead.",
      shared: "Share opened.",
      slide: "Slide",
      slideOneBody: "Lead with the customer pain point and make the scroll feel immediately relevant.",
      slideThreeTitle: "Ready to act",
      slideTwoTitle: "The better way",
      slidesReady: "{count} slides ready",
      sticker: "Interactive sticker",
      story: "Story",
      storyFrame: "Story frame",
      tapToReply: "Tap to reply",
      top: "Top",
      tone: "Tone",
      writing: "MARKOS is writing your content..."
    }
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
