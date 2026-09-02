"use client";

import { useEffect, useState } from "react";
import { Bookmark, CirclePlus, Columns3, Heart, ImagePlus, MessageCircle, MoreHorizontal, Pencil, Play, Repeat2, Send, Square } from "lucide-react";
import type { ContentType, Locale, MediaAssetRecord } from "@markos/shared-types";

export type ComposerContentType = Extract<ContentType, "POST" | "REEL" | "CAROUSEL" | "STORY">;

const formatOptions: Array<{
  description: { ar: string; en: string };
  icon: typeof Square;
  label: { ar: string; en: string };
  tone: string;
  value: ComposerContentType;
}> = [
  {
    description: { ar: "صورة أو فيديو واحد في الخلاصة", en: "Single image or video in the feed" },
    icon: Square,
    label: { ar: "منشور", en: "Post" },
    tone: "bg-[var(--sunlit-coral-soft)] text-[var(--sunlit-coral)]",
    value: "POST"
  },
  {
    description: { ar: "عدة صور أو فيديوهات في منشور واحد", en: "Multiple images or videos in one post" },
    icon: Columns3,
    label: { ar: "منشور متعدد", en: "Carousel" },
    tone: "bg-[#EAF2FB] text-[#316A9B]",
    value: "CAROUSEL"
  },
  {
    description: { ar: "فيديو عمودي قصير", en: "Short-form vertical video" },
    icon: Play,
    label: { ar: "ريل", en: "Reel" },
    tone: "bg-[#E8F5EC] text-[#267342]",
    value: "REEL"
  },
  {
    description: { ar: "محتوى عمودي بملء الشاشة", en: "Full-screen vertical content" },
    icon: CirclePlus,
    label: { ar: "قصة", en: "Story" },
    tone: "bg-[#F0ECFB] text-[#6843AD]",
    value: "STORY"
  }
];

export function ContentTypeStep({
  expanded,
  locale,
  locked,
  onChangeRequest,
  onSelect,
  value
}: {
  expanded: boolean;
  locale: Locale;
  locked: boolean;
  onChangeRequest: () => void;
  onSelect: (value: ComposerContentType) => void;
  value: ComposerContentType;
}) {
  const selected = formatOptions.find((option) => option.value === value) ?? formatOptions[0]!;
  const SelectedIcon = selected.icon;

  return (
    <section aria-labelledby="content-type-step-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-[var(--sunlit-ink)]" id="content-type-step-heading">
          {locale === "ar" ? "1 · اختر نوع المحتوى" : expanded ? "1 · Choose content type" : "1 · Content type"}
        </h2>
        {expanded ? (
          <span className="rounded-full bg-[var(--sunlit-coral-soft)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--sunlit-coral)]">
            {locale === "ar" ? "مطلوب" : "Required"}
          </span>
        ) : null}
      </div>
      {expanded ? (
        <>
          <p className="mt-2 text-sm text-[var(--sunlit-muted)]">
            {locale === "ar" ? "اختر التنسيق قبل إضافة الوسائط." : "Choose the format before adding media."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label={locale === "ar" ? "أنواع المحتوى" : "Content types"}>
            {formatOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  aria-pressed={value === option.value}
                  className="group min-h-36 rounded-2xl border border-[var(--sunlit-line-strong)] bg-white px-4 py-4 text-center transition hover:-translate-y-0.5 hover:border-[var(--sunlit-coral)] hover:shadow-sm"
                  key={option.value}
                  onClick={() => onSelect(option.value)}
                  type="button"
                >
                  <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${option.tone}`}>
                    <Icon size={21} />
                  </span>
                  <span className="mt-3 block font-extrabold text-[var(--sunlit-ink)]">{option.label[locale]}</span>
                  <span className="mx-auto mt-1 block max-w-40 text-xs font-semibold leading-5 text-[var(--sunlit-muted)]">{option.description[locale]}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3 flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-[var(--sunlit-line)] bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected.tone}`}>
              <SelectedIcon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold text-[var(--sunlit-ink)]">{selected.label[locale]}</span>
              <span className="block truncate text-xs font-semibold text-[var(--sunlit-muted)]">{selected.description[locale]}</span>
            </span>
          </div>
          {!locked ? (
            <button
              className="sunlit-secondary inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
              onClick={onChangeRequest}
              type="button"
            >
              <Pencil size={16} /> {locale === "ar" ? "تغيير" : "Change"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function InstagramPostPreview({
  brandName,
  caption,
  hashtags,
  locale,
  media,
  scheduledAt
}: {
  brandName: string;
  caption: string;
  hashtags: string[];
  locale: Locale;
  media: MediaAssetRecord;
  scheduledAt: string | undefined;
}) {
  const cleanBrand = brandName.trim().replace(/^@/, "").replace(/\s+/g, "_").toLowerCase().slice(0, 30) || "yourbrand";
  const captionWithTags = [caption.trim(), hashtags.join(" ")].filter(Boolean).join("\n\n");
  const [expanded, setExpanded] = useState(false);
  const isLongCaption = captionWithTags.length > 150;
  const visibleCaption = expanded || !isLongCaption ? captionWithTags : `${captionWithTags.slice(0, 147).trimEnd()}…`;
  const direction = /[\u0600-\u06ff]/.test(captionWithTags) ? "rtl" : "ltr";
  const scheduledLabel = scheduledAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { day: "numeric", month: "long" }).format(new Date(scheduledAt))
    : undefined;

  useEffect(() => setExpanded(false), [captionWithTags]);

  return (
    <article className="mx-auto flex h-[min(700px,calc(100vh-10rem))] w-[min(320px,calc(100vw-4rem))] max-w-full flex-col overflow-hidden rounded-[2.25rem] bg-white text-[#171717] shadow-[0_24px_70px_rgba(32,33,43,.16)]">
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-label="Workspace avatar placeholder"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--sunlit-yellow)] via-[var(--sunlit-coral)] to-[var(--sunlit-pink)] text-sm font-bold text-white"
          >
            {cleanBrand.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold">{cleanBrand}</span>
            <span className="block text-[10px] font-semibold text-black/45">Feed preview · approximation</span>
          </span>
        </div>
        <MoreHorizontal aria-hidden="true" size={22} />
      </header>

      {/* The natural dimensions preserve feed framing without an artificial crop. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={media.filename} className="block aspect-[4/5] w-full shrink-0 bg-black/5 object-contain" src={media.publicUrl} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center justify-between">
          <div aria-label="Instagram action preview" className="flex items-center gap-4">
            <Heart aria-hidden="true" size={25} strokeWidth={1.8} />
            <MessageCircle aria-hidden="true" size={25} strokeWidth={1.8} />
            <Repeat2 aria-hidden="true" size={25} strokeWidth={1.8} />
            <Send aria-hidden="true" size={24} strokeWidth={1.8} />
          </div>
          <Bookmark aria-hidden="true" size={25} strokeWidth={1.8} />
        </div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-black/40">Follower preview · no fabricated metrics</p>
        {captionWithTags ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-5" dir={direction}>
            <span className="font-extrabold">{cleanBrand}</span> {visibleCaption}
            {isLongCaption ? (
              <button className="ms-1 font-semibold text-black/50" onClick={() => setExpanded((value) => !value)} type="button">
                {expanded ? "less" : "more"}
              </button>
            ) : null}
          </p>
        ) : (
          <p className="mt-3 text-sm text-black/45">Caption preview will appear here.</p>
        )}
        {scheduledLabel ? <p className="mt-3 text-xs text-black/45">{scheduledLabel}</p> : null}
      </div>
    </article>
  );
}
