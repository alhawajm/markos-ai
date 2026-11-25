"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Pencil, PenLine, Scan, Undo2, X } from "lucide-react";
import { postRatios, postRatiosByValue, type PostArtwork } from "@markos/shared-types";
import { useModalDialog } from "./use-modal-dialog";

/* Object URLs only exist in the browser. */
/* eslint-disable @next/next/no-img-element */

export type TranslatePost = (en: string, ar: string) => string;

export function PostDesignEditor({
  src,
  caption,
  artwork,
  busy,
  error,
  close,
  save,
  t
}: {
  src: string;
  caption: string;
  artwork?: PostArtwork;
  busy: boolean;
  error: string;
  close: () => void;
  save: (artwork: PostArtwork, caption: string) => void;
  t: TranslatePost;
}) {
  const [draft, setDraft] = useState(artwork);
  const [copy, setCopy] = useState(caption);
  const [tool, setTool] = useState<"text" | "markup" | "resize">("text");
  const [stroke, setStroke] = useState<PostArtwork["strokes"][number]>([]);
  const points = useRef<PostArtwork["strokes"][number]>([]);
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose: close, closeDisabled: busy });

  function point(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  }
  function finishStroke() {
    const saved = points.current;
    points.current = [];
    setStroke([]);
    if (saved.length < 2) return;
    setDraft((previous) => (previous ? { ...previous, strokes: [...previous.strokes, saved] } : previous));
  }

  return (
    <dialog ref={dialogRef} onCancel={onCancel} onKeyDown={onKeyDown} className="post-editor-dialog" aria-labelledby="post-editor-title">
      <header>
        <h2 id="post-editor-title">{draft ? t("Edit post", "تعديل المنشور") : t("Post preview", "معاينة المنشور")}</h2>
        <button type="button" className="post-icon-action" onClick={close} disabled={busy} aria-label={t("Close preview", "إغلاق المعاينة")}>
          <X size={20} />
        </button>
      </header>
      <div className={draft ? "post-editor-body post-editor-body-edit" : "post-editor-body"}>
        <div className="post-editor-stage">
          <div className="post-editor-art">
            <img src={src} alt={t("Rendered post artwork", "تصميم المنشور")} />
            {draft && artwork && tool === "markup" ? (
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label={t("Draw on the post preview", "ارسم على معاينة المنشور")}
                className="post-editor-drawing"
                onPointerDown={(e) => {
                  if (busy || !e.isPrimary || draft.strokes.length >= 16) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  points.current = [point(e)];
                  setStroke(points.current);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId) || !points.current.length || points.current.length >= 250) return;
                  points.current = [...points.current, point(e)];
                  setStroke(points.current);
                }}
                onPointerUp={finishStroke}
                onLostPointerCapture={finishStroke}
              >
                {[...draft.strokes.slice(artwork.strokes.length), stroke].map((line, index) => (
                  <polyline
                    key={index}
                    points={line.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(" ")}
                    fill="none"
                    stroke="#6fe2e0"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            ) : null}
          </div>
          {!draft && caption ? <p dir="auto">{caption}</p> : null}
        </div>
        {draft ? (
          <form
            className="post-editor-controls"
            onSubmit={(e) => {
              e.preventDefault();
              save(draft, copy);
            }}
          >
            <div className="post-inline-actions" aria-label={t("Editing tools", "أدوات التعديل")}>
              <button type="button" aria-pressed={tool === "text"} onClick={() => setTool("text")}>
                <Pencil size={15} />
                {t("Text", "النص")}
              </button>
              <button type="button" aria-pressed={tool === "markup"} onClick={() => setTool("markup")}>
                <PenLine size={15} />
                {t("Markup", "الرسم")}
              </button>
              <button type="button" aria-pressed={tool === "resize"} onClick={() => setTool("resize")}>
                <Scan size={15} />
                {t("Resize", "الحجم")}
              </button>
            </div>
            {tool === "text" ? (
              <>
                <label>
                  {t("Headline on image", "العنوان على الصورة")}
                  <input dir="auto" maxLength={100} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label>
                  {t("Details on image", "التفاصيل على الصورة")}
                  <input dir="auto" maxLength={190} value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} />
                </label>
                <label>
                  {t("Instagram caption", "وصف إنستغرام")}
                  <textarea dir="auto" rows={5} maxLength={2200} value={copy} onChange={(e) => setCopy(e.target.value)} />
                </label>
              </>
            ) : tool === "markup" ? (
              <>
                <p>
                  {t(
                    "Draw directly on the post. Your edits appear in the updated preview after saving.",
                    "ارسم على المنشور مباشرة. تظهر التعديلات في المعاينة بعد الحفظ."
                  )}
                </p>
                <button
                  type="button"
                  className="post-design-link"
                  disabled={!draft.strokes.length || busy}
                  onClick={() => setDraft({ ...draft, strokes: draft.strokes.slice(0, -1) })}
                >
                  <Undo2 size={15} />
                  {t("Undo last stroke", "تراجع عن آخر ضربة")}
                </button>
              </>
            ) : (
              <>
                <label>
                  {t("Post shape", "شكل المنشور")}
                  <select value={draft.ratio} onChange={(e) => setDraft({ ...draft, ratio: e.target.value as PostArtwork["ratio"] })}>
                    {postRatios.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Photo zoom", "تكبير الصورة")}
                  <input type="range" min="1" max="2" step=".05" value={draft.zoom} onChange={(e) => setDraft({ ...draft, zoom: Number(e.target.value) })} />
                </label>
                <p>{t("Your new crop will appear after saving.", "يظهر الاقتصاص الجديد بعد الحفظ.")}</p>
                <div className="post-editor-ratio" style={{ aspectRatio: postRatiosByValue[draft.ratio] }} aria-hidden />
              </>
            )}
            {error ? (
              <p role="alert" className="workspace-chat-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className="post-design-primary" disabled={busy}>
              {busy ? t("Saving edits…", "جارٍ حفظ التعديلات…") : t("Save edits", "حفظ التعديلات")}
            </button>
          </form>
        ) : null}
      </div>
    </dialog>
  );
}
