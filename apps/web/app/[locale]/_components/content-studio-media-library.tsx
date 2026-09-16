"use client";

import { useState } from "react";
import { Check, FileImage, Film, Search } from "lucide-react";
import { contentMediaConstraints, type ContentType, type Locale, type MediaAssetRecord } from "@markos/shared-types";

export function ContentStudioMediaLibrary({
  assets,
  attachedIds,
  busy,
  contentType,
  blockedReason,
  errorMessage,
  locale,
  onAttach,
  selectionLimit = 1
}: {
  assets: MediaAssetRecord[];
  attachedIds: string[];
  busy: boolean;
  contentType: ContentType;
  blockedReason: string;
  errorMessage?: string;
  locale: Locale;
  onAttach: (assets: MediaAssetRecord[]) => void;
  selectionLimit?: number;
}) {
  const ar = locale === "ar";
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unavailableImages, setUnavailableImages] = useState<Set<string>>(() => new Set());
  const isImage = (asset: MediaAssetRecord) => asset.mimeType.toLowerCase().startsWith("image/");
  const isVideo = (asset: MediaAssetRecord) => asset.mimeType.toLowerCase().startsWith("video/");
  const visible = assets.filter(
    (asset) =>
      asset.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (kind === "all" || (kind === "IMAGE" ? isImage(asset) : isVideo(asset)))
  );
  const selected = selectedIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is MediaAssetRecord => !!asset);
  const compatible = (asset: MediaAssetRecord) => (contentMediaConstraints[contentType].mimeTypes as readonly string[]).includes(asset.mimeType.toLowerCase());
  const compatibilityHint =
    contentType === "REEL"
      ? ar
        ? "فيديو MP4 فقط"
        : "MP4 video only"
      : contentType === "STORY"
        ? ar
          ? "صورة JPEG أو فيديو MP4"
          : "JPEG image or MP4 video"
        : ar
          ? "صور JPEG فقط"
          : "JPEG images only";

  return (
    <div className="studio-library">
      {!blockedReason && (
        <p className="text-sm leading-6 text-[var(--muted)]">
          {ar
            ? selectionLimit > 1
              ? "اختر الصور بترتيب الشرائح ثم أرفقها. تُحفظ تعديلات المسودة أيضاً."
              : "اختر ملفاً ثم أرفقه. إرفاق الوسائط يحفظ التعديلات الحالية مع المسودة."
            : selectionLimit > 1
              ? "Select images in slide order, then attach them. Your draft edits are saved too."
              : "Choose a file, then attach it. Attaching media also saves your current draft edits."}
        </p>
      )}
      {(!blockedReason || blockedReason !== errorMessage) && (
        <p role="status" className="text-sm leading-6 text-[var(--muted)]">
          {blockedReason || compatibilityHint}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="studio-field min-w-0 flex-1">
          <span className="sr-only">{ar ? "البحث في الوسائط" : "Search media"}</span>
          <span className="relative block">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute start-3 top-3.5 text-[var(--muted)]" />
            <input
              className="!ps-10"
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={ar ? "البحث باسم الملف" : "Search filenames"}
              type="search"
              value={query}
            />
          </span>
        </label>
        <label className="studio-field">
          <span className="sr-only">{ar ? "نوع الوسائط" : "Media type"}</span>
          <select aria-label={ar ? "نوع الوسائط" : "Media type"} disabled={busy} onChange={(event) => setKind(event.target.value)} value={kind}>
            <option value="all">{ar ? "جميع الوسائط" : "All media"}</option>
            <option value="IMAGE">{ar ? "الصور" : "Images"}</option>
            <option value="VIDEO">{ar ? "الفيديو" : "Videos"}</option>
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface-muted)] p-5 text-sm leading-6 text-[var(--muted)]">
          {assets.length === 0
            ? ar
              ? "ارفع صورة JPEG من المحرر لبدء مكتبة الوسائط."
              : "Upload a JPEG from the editor to start your media library."
            : ar
              ? "لا توجد وسائط تطابق البحث."
              : "No media matches your search."}
        </p>
      ) : (
        <div className="studio-library-grid">
          {visible.map((asset) => {
            const attached = attachedIds.includes(asset.id);
            return (
              <button
                aria-pressed={selectedIds.includes(asset.id)}
                className="studio-library-item"
                disabled={
                  busy ||
                  attached ||
                  !!blockedReason ||
                  !compatible(asset) ||
                  (selectionLimit > 1 && selectedIds.length >= selectionLimit && !selectedIds.includes(asset.id))
                }
                key={asset.id}
                title={asset.filename}
                onClick={() =>
                  setSelectedIds((ids) =>
                    ids.includes(asset.id)
                      ? ids.filter((id) => id !== asset.id)
                      : selectionLimit === 1
                        ? [asset.id]
                        : ids.length < selectionLimit
                          ? [...ids, asset.id]
                          : ids
                  )
                }
                type="button"
              >
                <span className="studio-library-thumbnail">
                  {isImage(asset) && asset.publicUrl && !unavailableImages.has(asset.id) ? (
                    // Library files are workspace uploads, so the URL cannot be known to Next's remote image configuration.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" loading="lazy" onError={() => setUnavailableImages((current) => new Set([...current, asset.id]))} src={asset.publicUrl} />
                  ) : isVideo(asset) ? (
                    <Film aria-hidden="true" size={32} />
                  ) : !compatible(asset) ? (
                    compatibilityHint
                  ) : (
                    <FileImage aria-hidden="true" size={32} />
                  )}
                </span>
                <span className="line-clamp-2 break-all text-sm font-medium">{asset.filename}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]">
                  {selectedIds.includes(asset.id) ? (
                    <>
                      <Check aria-hidden="true" size={14} />
                      {ar ? `محدد ${selectedIds.indexOf(asset.id) + 1}` : `Selected ${selectedIds.indexOf(asset.id) + 1}`}
                    </>
                  ) : attached ? (
                    <>
                      <Check aria-hidden="true" size={14} />
                      {ar ? "مرفق" : "Attached"}
                    </>
                  ) : (
                    `${asset.width ?? "—"} × ${asset.height ?? "—"}`
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">
          {selected.length
            ? selectionLimit > 1
              ? ar
                ? `${selected.length} صور محددة`
                : `${selected.length} images selected`
              : selected[0]?.filename
            : ar
              ? "لم يتم اختيار ملف"
              : "No file selected"}
        </span>
        <button
          className="studio-button studio-button-primary"
          disabled={
            busy ||
            !!blockedReason ||
            !selected.length ||
            selected.length > selectionLimit ||
            selected.some((asset) => attachedIds.includes(asset.id) || !compatible(asset))
          }
          onClick={() => selected.length && onAttach(selected)}
          type="button"
        >
          {busy ? (ar ? "جارٍ الإرفاق…" : "Attaching…") : ar ? "إرفاق الملف" : "Attach selected"}
        </button>
      </div>
    </div>
  );
}
