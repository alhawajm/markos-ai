"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Heart, ImagePlus, MessageCircle, MoreHorizontal, Repeat2, Send } from "lucide-react";
import type { ContentType, Locale, MediaAssetRecord } from "@markos/shared-types";

export function ContentStudioPreview({
  brandName,
  caption,
  contentType,
  locale,
  media,
  fallbackRatio = "4:5"
}: {
  brandName: string;
  caption: string;
  contentType: ContentType;
  locale: Locale;
  media: MediaAssetRecord[];
  fallbackRatio?: "1:1" | "4:5" | "9:16";
}) {
  const [slide, setSlide] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [failedMedia, setFailedMedia] = useState<string | null>(null);
  const selected = media[Math.min(slide, Math.max(0, media.length - 1))];
  const isStory = contentType === "STORY";
  const isVertical = isStory || contentType === "REEL";
  const username = brandName.trim() || (locale === "ar" ? "نشاطك التجاري" : "Your business");
  const fullCaption = caption;
  const longCaption = fullCaption.length > 140;
  const shownCaption = expanded || !longCaption ? fullCaption : `${fullCaption.slice(0, 137).trimEnd()}…`;

  useEffect(() => {
    setSlide(0);
    setExpanded(false);
  }, [contentType]);
  useEffect(() => setExpanded(false), [fullCaption]);

  const mediaElement =
    selected && failedMedia !== selected.id ? (
      selected.mimeType.startsWith("video/") ? (
        <video
          aria-label={selected.filename}
          controls
          muted
          playsInline
          preload="metadata"
          src={selected.publicUrl}
          onError={() => setFailedMedia(selected.id)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={selected.filename} src={selected.publicUrl} onError={() => setFailedMedia(selected.id)} />
      )
    ) : (
      <div className="studio-preview-placeholder">
        <ImagePlus aria-hidden="true" size={28} />
        <span>
          {selected ? (locale === "ar" ? "تعذر تحميل الوسائط" : "Media could not load") : locale === "ar" ? "ستظهر الوسائط هنا" : "Your media will appear here"}
        </span>
      </div>
    );
  const identity = (
    <>
      <span className="studio-instagram-avatar" aria-hidden="true">
        {username.slice(0, 1)}
      </span>
      <strong className="truncate">{username}</strong>
    </>
  );
  const actions = (
    <>
      <Heart />
      <MessageCircle />
      <Repeat2 />
      <Send />
      <Bookmark />
    </>
  );
  const captionElement = fullCaption ? (
    <p className="studio-instagram-caption" dir="auto">
      <strong>{username}</strong>{" "}
      <span data-testid="preview-caption" className="studio-caption-text" dir="auto">
        {shownCaption}
      </span>
      {longCaption && (
        <button type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? (locale === "ar" ? "أقل" : "less") : locale === "ar" ? "المزيد" : "more"}
        </button>
      )}
    </p>
  ) : (
    <p className="studio-instagram-caption text-white/60">{locale === "ar" ? "ستظهر معاينة النص هنا." : "Your caption will appear here."}</p>
  );

  return (
    <div className="studio-preview-stage">
      <article
        className={`studio-instagram ${isVertical ? "studio-instagram-vertical" : ""}`}
        aria-label={locale === "ar" ? "معاينة Instagram" : "Instagram post preview"}
        data-content-type={contentType}
      >
        {isVertical ? (
          <>
            <div className="studio-instagram-vertical-media">{mediaElement}</div>
            <header className="studio-instagram-overlay-header">
              {isStory ? (
                <>
                  <div className="studio-story-progress" aria-hidden="true">
                    <span />
                  </div>
                  <div className="studio-instagram-identity">
                    {identity}
                    <MoreHorizontal className="ms-auto" />
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <ArrowLeft aria-hidden="true" />
                  <strong>Reels</strong>
                </div>
              )}
            </header>
            {!isStory && (
              <>
                <div className="studio-reel-actions" aria-hidden="true">
                  {actions}
                </div>
                <div className={`studio-reel-caption ${expanded ? "studio-reel-caption-expanded" : ""}`}>
                  <div className="studio-instagram-identity">{identity}</div>
                  {captionElement}
                </div>
              </>
            )}
            <div className="studio-follower-reply" aria-hidden="true">
              <span>{isStory ? (locale === "ar" ? "إرسال رسالة" : "Send message") : locale === "ar" ? "إضافة تعليق…" : "Add a comment…"}</span>
              {isStory && (
                <>
                  <Heart />
                  <Send />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="studio-instagram-feed">
            <header className="studio-instagram-identity">
              {identity}
              <MoreHorizontal className="ms-auto" aria-hidden="true" />
            </header>
            <div
              className="studio-instagram-feed-media"
              style={{ aspectRatio: selected?.width && selected.height ? `${selected.width} / ${selected.height}` : fallbackRatio.replace(":", "/") }}
            >
              {mediaElement}
              {contentType === "CAROUSEL" && media.length > 1 && (
                <>
                  <span className="studio-slide-count" dir="ltr">
                    {Math.min(slide + 1, media.length)}/{media.length}
                  </span>
                  <button
                    className="studio-slide-previous"
                    aria-label={locale === "ar" ? "الشريحة السابقة" : "Previous slide"}
                    disabled={slide === 0}
                    onClick={() => setSlide(Math.max(0, slide - 1))}
                    type="button"
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    className="studio-slide-next"
                    aria-label={locale === "ar" ? "الشريحة التالية" : "Next slide"}
                    disabled={slide >= media.length - 1}
                    onClick={() => setSlide(Math.min(media.length - 1, slide + 1))}
                    type="button"
                  >
                    <ChevronRight />
                  </button>
                </>
              )}
            </div>
            {contentType === "CAROUSEL" && media.length > 1 && (
              <div className="studio-slide-dots" aria-hidden="true">
                {media.map((asset, index) => (
                  <span className={index === slide ? "active" : ""} key={asset.id} />
                ))}
              </div>
            )}
            <div className="studio-instagram-actions" aria-hidden="true">
              {actions}
            </div>
            {captionElement}
          </div>
        )}
      </article>
    </div>
  );
}
