"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Images, Sparkles, X } from "lucide-react";
import type { Locale, MediaAssetRecord } from "@markos/shared-types";

export function CarouselSlides({
  locale,
  mediaIds,
  assets,
  disabled,
  activeId,
  busy,
  onReorder,
  onSelect,
  onRemove
}: {
  locale: Locale;
  mediaIds: string[];
  assets: MediaAssetRecord[];
  disabled: boolean;
  activeId: string | null;
  busy: boolean;
  onReorder: (from: number, to: number) => void;
  onSelect: (id: string | null, action: "upload" | "library" | "generate") => void;
  onRemove: (id: string) => void;
}) {
  const ar = locale === "ar";
  const [dragged, setDragged] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  return (
    <div className="studio-carousel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{ar ? "شرائح المنشور" : "Carousel slides"}</h3>
        <span className="text-sm text-[var(--text-muted)]">{ar ? "اسحب أو استخدم الأسهم للترتيب" : "Drag or use arrows to reorder"}</span>
      </div>
      <ol className="space-y-3" aria-label={ar ? "ترتيب الشرائح" : "Slide order"}>
        {mediaIds.map((id, index) => {
          const asset = assets.find((item) => item.id === id);
          const label = ar ? `الشريحة ${index + 1}` : `Slide ${index + 1}`;
          return (
            <li
              key={id}
              className="studio-slide"
              aria-label={label}
              aria-busy={busy && activeId === id}
              draggable={!disabled}
              onDragStart={(event) => {
                if (disabled) {
                  event.preventDefault();
                  return;
                }
                setDragged(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => {
                if (!disabled && dragged !== null) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!disabled && dragged !== null && dragged !== index) onReorder(dragged, index);
                setDragged(null);
              }}
            >
              <div className="studio-slide-thumbnail">
                {asset?.publicUrl && !missing.includes(id) ? (
                  // Workspace media URLs are resolved at runtime.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.publicUrl} alt={asset.filename} draggable={false} onError={() => setMissing((items) => [...items, id])} />
                ) : (
                  <Images size={30} aria-hidden="true" />
                )}
                <span>{index + 1}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical size={17} aria-hidden="true" className="text-[var(--text-muted)]" />
                  <strong>{label}</strong>
                </div>
                <p className="truncate text-sm text-[var(--text-muted)]">{asset?.filename ?? (ar ? "صورة غير متاحة" : "Unavailable image")}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="studio-button" type="button" disabled={disabled} onClick={() => onSelect(id, "upload")}>
                    <ImagePlus size={16} />
                    {ar ? "استبدال" : "Replace"}
                  </button>
                  <button className="studio-button" type="button" disabled={disabled} onClick={() => onSelect(id, "library")}>
                    <Images size={16} />
                    {ar ? "المكتبة" : "Library"}
                  </button>
                  <button className="studio-button" type="button" disabled={disabled} onClick={() => onSelect(id, "generate")}>
                    <Sparkles size={16} />
                    {ar ? "إنشاء صورة" : "Generate"}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className="studio-button"
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={ar ? `تحريك ${label} لأعلى` : `Move ${label.toLowerCase()} up`}
                  onClick={() => onReorder(index, index - 1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  className="studio-button"
                  type="button"
                  disabled={disabled || index === mediaIds.length - 1}
                  aria-label={ar ? `تحريك ${label} لأسفل` : `Move ${label.toLowerCase()} down`}
                  onClick={() => onReorder(index, index + 1)}
                >
                  <ArrowDown size={17} />
                </button>
                <button
                  className="studio-button"
                  type="button"
                  disabled={disabled}
                  aria-label={`${ar ? "إزالة" : "Remove"} ${asset?.filename ?? label}`}
                  onClick={() => onRemove(id)}
                >
                  <X size={17} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {mediaIds.length < 10 && (
        <button className="studio-button" type="button" disabled={disabled} onClick={() => onSelect(null, "generate")}>
          <Sparkles size={18} />
          {ar ? "إنشاء شريحة جديدة" : "Generate a new slide"}
        </button>
      )}
    </div>
  );
}
