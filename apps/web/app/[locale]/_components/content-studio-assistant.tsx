"use client";

import type { ReactNode } from "react";
import { Check, Eye, Film, RefreshCcw, Square, X } from "lucide-react";
import type { ContentType, Locale, MediaGenerationJobRecord } from "@markos/shared-types";
import { MarkosAiIcon } from "./markos-ai-icon";

export type StudioSidePanel = "assistant" | "preview";

export function ContentStudioAssistantPanel({
  activePanel,
  assistantCaption,
  assistantApplied,
  assistantMessage,
  assistantMessageKind,
  assistantVisualDirection,
  busy,
  canGenerate,
  contentType,
  hasSuggestion,
  locale,
  onCancel,
  onCaptionChange,
  onDismissReplacement,
  onGenerate,
  onGenerateApprovedMedia,
  onCancelMedia,
  onInsert,
  onPanelChange,
  onPromptChange,
  onVisualDirectionChange,
  onRetryMedia,
  mediaBusy,
  mediaGeneration,
  preview,
  prompt,
  replacementWarning
}: {
  activePanel: StudioSidePanel;
  assistantCaption: string;
  assistantApplied: boolean;
  assistantMessage: string;
  assistantMessageKind: "error" | "info" | "success";
  assistantVisualDirection: string;
  busy: boolean;
  canGenerate: boolean;
  contentType: ContentType;
  hasSuggestion: boolean;
  locale: Locale;
  onCancel: () => void;
  onCaptionChange: (value: string) => void;
  onDismissReplacement: () => void;
  onGenerate: () => void;
  onGenerateApprovedMedia: () => void;
  onCancelMedia: () => void;
  onInsert: (force?: boolean) => void;
  onPanelChange: (panel: StudioSidePanel) => void;
  onPromptChange: (value: string) => void;
  onVisualDirectionChange: (value: string) => void;
  onRetryMedia: () => void;
  mediaBusy: boolean;
  mediaGeneration: MediaGenerationJobRecord | null;
  preview: ReactNode;
  prompt: string;
  replacementWarning: boolean;
}) {
  const copy =
    locale === "ar"
      ? {
          approve: "إضافة النص والتوجيه إلى الاستوديو",
          cancel: "إلغاء",
          caption: "النص المقترح",
          generate: "إنشاء اقتراح",
          generating: "MARKOS يعمل على الفكرة...",
          instruction: "ما الذي تريد أن يحققه هذا المنشور؟",
          instructionPlaceholder: "صف الهدف أو العرض أو الجمهور أو الرسالة التي تريد توصيلها.",
          preview: "المعاينة",
          replace: "استبدال محتوى الاستوديو",
          replaceBody: "يحتوي الاستوديو بالفعل على نص أو توجيه بصري. أكد الاستبدال أو واصل التحرير.",
          retry: "إعادة المحاولة",
          title: "مساعد MARKOS AI",
          visual: "التوجيه البصري"
        }
      : {
          approve: "Insert approved direction",
          cancel: "Cancel",
          caption: "Suggested caption",
          generate: "Generate suggestion",
          generating: "MARKOS is developing the idea...",
          instruction: "What should this post accomplish?",
          instructionPlaceholder: "Describe the goal, offer, audience, or message you want to communicate.",
          preview: "Preview",
          replace: "Replace studio content",
          replaceBody: "The studio already contains a caption or visual direction. Confirm replacement, or keep editing.",
          retry: "Retry",
          title: "MARKOS AI Assistant",
          visual: "Visual direction"
        };

  return (
    <aside className="sunlit-panel flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] xl:h-[calc(100vh-4.5rem)]" aria-label={copy.title}>
      <header className="border-b border-[var(--sunlit-line)] px-4 pt-4 sm:px-5">
        <div className="flex items-center gap-3 pb-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)]">
            <MarkosAiIcon size={21} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--sunlit-ink)]">{copy.title}</h2>
            <p className="mt-0.5 text-xs font-bold text-[var(--sunlit-muted)]">Instagram · {contentType.toLowerCase()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1" role="tablist">
          <PanelTab active={activePanel === "assistant"} icon={<MarkosAiIcon size={16} />} label={copy.title} onClick={() => onPanelChange("assistant")} />
          <PanelTab active={activePanel === "preview"} icon={<Eye size={17} />} label={copy.preview} onClick={() => onPanelChange("preview")} />
        </div>
      </header>

      {activePanel === "preview" ? (
        <div className="sunlit-card-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">{preview}</div>
      ) : (
        <div className="sunlit-card-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
          <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
            {copy.instruction}
            <textarea
              className="sunlit-field min-h-28 resize-none rounded-xl p-4 text-base font-normal leading-6 outline-none"
              disabled={busy}
              maxLength={1000}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder={copy.instructionPlaceholder}
              value={prompt}
            />
          </label>

          <div className="flex gap-2">
            <button
              className="sunlit-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
              disabled={!canGenerate || busy}
              onClick={onGenerate}
              type="button"
            >
              {busy ? <RefreshCcw className="animate-spin" size={17} /> : <MarkosAiIcon size={17} />}
              {busy ? copy.generating : hasSuggestion ? copy.retry : copy.generate}
            </button>
            {busy ? (
              <button
                className="sunlit-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-extrabold"
                onClick={onCancel}
                type="button"
              >
                <X size={16} /> {copy.cancel}
              </button>
            ) : null}
          </div>

          {assistantMessage ? (
            <p
              aria-live="polite"
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold leading-5 ${
                assistantMessageKind === "error"
                  ? "bg-[rgb(255_239_242)] text-[var(--sunlit-pink)]"
                  : assistantMessageKind === "success"
                    ? "bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
                    : "bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-ink-soft)]"
              }`}
            >
              {assistantMessage}
            </p>
          ) : null}

          {hasSuggestion ? (
            <section className="space-y-4 border-t border-[var(--sunlit-line)] pt-5">
              <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                {copy.caption}
                <textarea
                  aria-label={copy.caption}
                  className="sunlit-field min-h-40 resize-none rounded-xl p-4 text-base font-normal leading-7 outline-none"
                  maxLength={2200}
                  onChange={(event) => onCaptionChange(event.target.value)}
                  value={assistantCaption}
                />
              </label>
              <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                {copy.visual}
                <textarea
                  aria-label={copy.visual}
                  className="sunlit-field min-h-32 resize-none rounded-xl p-4 text-base font-normal leading-7 outline-none"
                  maxLength={2000}
                  onChange={(event) => onVisualDirectionChange(event.target.value)}
                  value={assistantVisualDirection}
                />
              </label>

              {replacementWarning ? (
                <div className="rounded-xl border border-[rgb(255_102_90_/_35%)] bg-[var(--sunlit-coral-soft)] p-3">
                  <p className="text-sm font-semibold leading-5 text-[var(--sunlit-ink-soft)]">{copy.replaceBody}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="sunlit-primary min-h-10 rounded-lg px-3 text-xs font-extrabold" onClick={() => onInsert(true)} type="button">
                      {copy.replace}
                    </button>
                    <button className="sunlit-secondary min-h-10 rounded-lg px-3 text-xs font-extrabold" onClick={onDismissReplacement} type="button">
                      {locale === "ar" ? "متابعة التحرير" : "Keep editing"}
                    </button>
                  </div>
                </div>
              ) : assistantApplied ? (
                <ApprovedMediaAction
                  busy={mediaBusy}
                  contentType={contentType}
                  generation={mediaGeneration}
                  locale={locale}
                  onCancel={onCancelMedia}
                  onGenerate={onGenerateApprovedMedia}
                  onRetry={onRetryMedia}
                />
              ) : (
                <button
                  className="sunlit-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
                  disabled={!assistantCaption.trim() || !assistantVisualDirection.trim()}
                  onClick={() => onInsert()}
                  type="button"
                >
                  <Check size={18} /> {copy.approve}
                </button>
              )}
            </section>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function ApprovedMediaAction({
  busy,
  contentType,
  generation,
  locale,
  onCancel,
  onGenerate,
  onRetry
}: {
  busy: boolean;
  contentType: ContentType;
  generation: MediaGenerationJobRecord | null;
  locale: Locale;
  onCancel: () => void;
  onGenerate: () => void;
  onRetry: () => void;
}) {
  const isVideo = contentType === "REEL" || contentType === "STORY";
  const isActive = generation ? ["QUEUED", "STARTING", "GENERATING", "PROCESSING"].includes(generation.status) : false;
  const isFailed = generation?.status === "FAILED";
  const isCompleted = generation?.status === "COMPLETED";
  const progress = generation?.progress ?? 0;

  return (
    <div className="rounded-2xl border border-[var(--sunlit-aqua)] bg-[var(--sunlit-aqua-soft)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--sunlit-aqua-dark)]">
          {isVideo ? <Film size={19} /> : <MarkosAiIcon size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[var(--sunlit-ink)]">{locale === "ar" ? "تمت الموافقة على التوجيه" : "Direction approved"}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-[var(--sunlit-ink-soft)]">
            {isCompleted
              ? locale === "ar"
                ? "تم إنشاء الوسائط وإضافتها إلى الاستوديو."
                : "Media generated and inserted into the studio."
              : isFailed
                ? generation?.errorMessage || (locale === "ar" ? "تعذر إنشاء الفيديو." : "Video generation failed.")
                : isActive
                  ? locale === "ar"
                    ? `جارٍ إنشاء الفيديو · ${progress}%`
                    : `Generating video · ${progress}%`
                  : locale === "ar"
                    ? "ابدأ إنشاء الوسائط عندما تكون راضياً عن التوجيه."
                    : "Start media generation when the direction is ready."}
          </p>
        </div>
      </div>

      {isActive ? (
        <>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-white"
            aria-label={`${progress}%`}
            role="progressbar"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-[var(--sunlit-aqua)] transition-[width] motion-reduce:transition-none"
              style={{ width: `${Math.max(4, progress)}%` }}
            />
          </div>
          <button className="sunlit-secondary mt-3 min-h-10 rounded-xl px-4 text-sm font-extrabold" onClick={onCancel} type="button">
            {locale === "ar" ? "إلغاء الإنشاء" : "Cancel generation"}
          </button>
        </>
      ) : isFailed ? (
        <button className="sunlit-primary mt-4 min-h-11 rounded-xl px-4 text-sm font-extrabold" onClick={onRetry} type="button">
          <RefreshCcw className="me-2 inline" size={16} /> {locale === "ar" ? "إعادة المحاولة" : "Retry video"}
        </button>
      ) : isCompleted ? null : (
        <button
          className="sunlit-primary mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
          disabled={busy}
          onClick={onGenerate}
          type="button"
        >
          {busy ? <RefreshCcw className="animate-spin" size={17} /> : isVideo ? <Film size={18} /> : <MarkosAiIcon size={18} />}
          {busy
            ? locale === "ar"
              ? "جارٍ البدء..."
              : "Starting..."
            : locale === "ar"
              ? isVideo
                ? "إنشاء فيديو"
                : "إنشاء صورة"
              : isVideo
                ? "Generate video"
                : "Generate image"}
        </button>
      )}
    </div>
  );
}

export function EmptyStudioPreview({ locale }: { locale: Locale }) {
  return (
    <div className="mx-auto flex h-[min(650px,calc(100vh-12rem))] min-h-[460px] w-[min(310px,100%)] flex-col overflow-hidden rounded-[2.2rem] bg-white shadow-[0_22px_65px_rgba(32,33,43,.15)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--sunlit-ink)] text-xs font-bold text-white">M</span>
        <span className="text-sm font-extrabold">yourbrand</span>
      </div>
      <div className="grid aspect-[4/5] w-full place-items-center bg-[linear-gradient(145deg,var(--sunlit-paper-deep),var(--sunlit-aqua-soft))] text-[var(--sunlit-muted)]">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/75">
          <Square size={24} />
        </span>
      </div>
      <div className="flex-1 px-4 py-4">
        <p className="text-sm font-extrabold">yourbrand</p>
        <p className="mt-2 text-sm leading-6 text-black/45">
          {locale === "ar" ? "ستظهر معاينة النص والوسائط هنا." : "Your caption and media preview will appear here."}
        </p>
      </div>
    </div>
  );
}

function PanelTab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-t-xl border-b-2 px-2 text-xs font-extrabold ${
        active ? "border-[var(--sunlit-pink)] text-[var(--sunlit-pink)]" : "border-transparent text-[var(--sunlit-muted)]"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon} {label}
    </button>
  );
}
