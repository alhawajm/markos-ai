"use client";
import { useRef, useState } from "react";
import { Clapperboard, Upload } from "lucide-react";
import type { MarkosApiClient } from "@markos/api-client";
import type { MediaAssetRecord } from "@markos/shared-types";

export function MotionReelComposer({
  api,
  assets,
  duration,
  disabled,
  t,
  onUploaded,
  generate
}: {
  api: MarkosApiClient;
  assets: MediaAssetRecord[];
  duration: number;
  disabled: boolean;
  t: (en: string, ar: string) => string;
  onUploaded: (asset: MediaAssetRecord) => void;
  generate: (motion: { artworkMediaAssetId: string; textCards: string[] }) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [cards, setCards] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const available = assets.filter((asset) => asset.mimeType === "image/jpeg");
  const artwork = available.find((asset) => asset.id === selected);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.type !== "image/jpeg" || file.size > 8_000_000) {
        setError(t("Choose a JPEG up to 8 MB.", "اختر صورة JPEG بحجم لا يتجاوز ٨ ميغابايت."));
        return;
      }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read"));
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      const asset = await api.uploadMedia({ type: "IMAGE", filename: file.name, mimeType: "image/jpeg", base64Data: data });
      onUploaded(asset);
      setSelected(asset.id);
    } catch {
      setError(t("Could not upload this artwork. Try another JPEG.", "تعذّر رفع التصميم. جرّب صورة JPEG أخرى."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="motion-reel-composer" aria-label={t("Motion Reel", "ريل متحرك")}>
      <h3>
        <Clapperboard size={20} aria-hidden /> {t("Motion Reel", "ريل متحرك")}
      </h3>
      <p>
        {t(
          "Animate your artwork with a gentle zoom and exact text. No video AI fee.",
          "حرّك تصميمك بتقريب هادئ ونص دقيق، دون رسوم لتوليد الفيديو بالذكاء الاصطناعي."
        )}
      </p>
      <label className="studio-field">
        <span>{t("Artwork", "التصميم")}</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={disabled || busy}>
          <option value="">{t("Choose a JPEG from your library", "اختر صورة JPEG من مكتبتك")}</option>
          {available.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.filename}
            </option>
          ))}
        </select>
      </label>
      {artwork ? <img src={artwork.publicUrl} alt={artwork.filename} style={{ width: "100%", height: 160, objectFit: "contain" }} /> : null}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button type="button" className="studio-button" disabled={disabled || busy} onClick={() => input.current?.click()}>
        <Upload size={16} /> {t("Upload JPEG artwork", "رفع تصميم JPEG")}
      </button>
      {cards.slice(0, Math.min(3, duration / 2)).map((text, index) => (
        <label className="studio-field" key={index}>
          <span>
            {t("Text card", "بطاقة نصية")} {index + 1} · {t("optional", "اختياري")}
          </span>
          <textarea
            dir="auto"
            rows={2}
            maxLength={160}
            disabled={disabled || busy}
            value={text}
            onChange={(e) => setCards((current) => current.map((line, i) => (i === index ? e.target.value : line)))}
          />
        </label>
      ))}
      <p className="create-muted">
        {t(
          "Use English and Arabic on separate lines. Leave cards empty to keep only your design’s text.",
          "اكتب الإنجليزية والعربية في سطرين منفصلين. اترك البطاقات فارغة للاكتفاء بنص التصميم."
        )}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        className="studio-button studio-button-primary"
        disabled={disabled || busy || !artwork}
        onClick={() => {
          if (!artwork) return;
          setBusy(true);
          setError("");
          void generate({
            artworkMediaAssetId: artwork.id,
            textCards: cards
              .slice(0, Math.min(3, duration / 2))
              .map((text) => text.trim())
              .filter(Boolean)
          })
            .catch(() => setError(t("Could not queue the Reel. Refresh the draft and try again.", "تعذّرت إضافة الريل. حدّث المسودة وحاول مجددًا.")))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? t("Preparing…", "جارٍ التجهيز…") : t("Create Motion Reel", "إنشاء ريل متحرك")}
      </button>
    </section>
  );
}
