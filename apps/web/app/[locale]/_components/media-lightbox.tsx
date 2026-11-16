"use client";
/* eslint-disable @next/next/no-img-element -- Full-size inspection displays the original user media. */
import { useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Locale, MediaAssetRecord } from "@markos/shared-types";
import { useModalDialog } from "./use-modal-dialog";
export function MediaLightbox({ assets, initialId, locale, onClose }: { assets: MediaAssetRecord[]; initialId: string; locale: Locale; onClose: () => void }) {
  const [index, setIndex] = useState(
      Math.max(
        0,
        assets.findIndex((asset) => asset.id === initialId)
      )
    ),
    [zoom, setZoom] = useState(false),
    [failed, setFailed] = useState(false);
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose }),
    ar = locale === "ar",
    asset = assets[Math.min(index, assets.length - 1)];
  if (!asset) return null;
  const video = asset.mimeType.startsWith("video/");
  function move(next: number) {
    setIndex(next);
    setZoom(false);
    setFailed(false);
  }
  return (
    <dialog
      className="media-lightbox"
      aria-label={ar ? "عرض الوسائط بالحجم الكامل" : "Full-size media"}
      ref={dialogRef}
      onCancel={onCancel}
      onKeyDown={(event) => {
        onKeyDown(event);
        if (["INPUT", "VIDEO", "BUTTON"].includes((event.target as HTMLElement).tagName)) return;
        if (event.key === "ArrowRight" && index < assets.length - 1) {
          event.preventDefault();
          move(index + 1);
        }
        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          move(index - 1);
        }
      }}
    >
      <header>
        <span dir="auto">{asset.filename}</span>
        <small>
          {index + 1} / {assets.length}
        </small>
        {!video ? (
          <button aria-label={zoom ? (ar ? "ملاءمة الشاشة" : "Fit to screen") : ar ? "تكبير" : "Zoom in"} onClick={() => setZoom(!zoom)}>
            {zoom ? <ZoomOut /> : <ZoomIn />}
          </button>
        ) : null}
        <button aria-label={ar ? "إغلاق العرض" : "Close full-size view"} onClick={onClose}>
          <X />
        </button>
      </header>
      <div className={`media-lightbox-stage ${zoom ? "media-lightbox-zoomed" : ""}`}>
        {failed ? (
          <p role="alert">{ar ? "تعذّر تحميل الوسائط. أغلق العرض وحاول مجددًا." : "Couldn’t load this media. Close and retry."}</p>
        ) : video ? (
          <video key={asset.id} src={asset.publicUrl} controls playsInline preload="metadata" aria-label={asset.filename} onError={() => setFailed(true)} />
        ) : (
          <img src={asset.publicUrl} alt={asset.filename} onError={() => setFailed(true)} />
        )}
      </div>
      {assets.length > 1 ? (
        <footer>
          <button aria-label={ar ? "الوسائط السابقة" : "Previous media"} disabled={index === 0} onClick={() => move(index - 1)}>
            <ChevronLeft />
          </button>
          <button aria-label={ar ? "الوسائط التالية" : "Next media"} disabled={index === assets.length - 1} onClick={() => move(index + 1)}>
            <ChevronRight />
          </button>
        </footer>
      ) : null}
    </dialog>
  );
}
