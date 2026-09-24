import React, { useEffect, useMemo, useState } from "react";
import { Image } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Clapperboard, Upload } from "lucide-react-native";
import type { MediaAssetRecord } from "@markos/shared-types";
import { useAccount, useAppearance } from "../providers";
import { Button, Card, Field, Notice, Txt } from "../ui";
import { errorMessage } from "../errors";
import { StudioDeviceStore } from "./device-store";

export function MotionReel({
  contentId,
  mediaId,
  disabled,
  duration,
  assets,
  generate
}: {
  contentId: string;
  mediaId: string;
  disabled: boolean;
  duration: number;
  assets: MediaAssetRecord[];
  generate: (motion: { artworkMediaAssetId: string; textCards: string[] }) => Promise<void>;
}) {
  const { api, scope, epoch, session, queryClient } = useAccount();
  const device = useMemo(() => new StudioDeviceStore(scope, epoch, contentId, session.workspace.id), [scope, epoch, contentId, session.workspace.id]);
  const { t } = useAppearance();
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const artwork = assets.find((asset) => asset.id === artworkId) ?? null;
  const [restored, setRestored] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cards, setCards] = useState(["", "", ""]);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void device
      .readMotion(mediaId)
      .then((saved) => {
        if (mounted) {
          setArtworkId(saved.artworkId);
          setCards(saved.cards);
          setRestored(true);
          setError("");
        }
      })
      .catch((problem) => {
        if (mounted) setError(errorMessage(problem, t));
      });
    return () => {
      mounted = false;
    };
  }, [device, mediaId, attempt]);
  useEffect(() => {
    if (!restored) return;
    let mounted = true;
    void device.saveMotion(mediaId, { artworkId, cards }).catch(() => {
      if (mounted)
        setError(
          t("Could not save the Motion Reel settings on this device. Keep this screen open.", "تعذّر حفظ إعدادات الريل على الجهاز. أبقِ هذه الشاشة مفتوحة.")
        );
    });
    return () => {
      mounted = false;
    };
  }, [device, mediaId, artworkId, cards, restored]);
  const locked = disabled || !restored;
  async function upload() {
    setBusy(true);
    setError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "image/jpeg", copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets[0]!;
      if ((file.size ?? new File(file.uri).size) > 8_000_000) {
        setError(t("Choose a JPEG up to 8 MB.", "اختر صورة JPEG بحجم لا يتجاوز ٨ ميغابايت."));
        return;
      }
      const saved = await api.uploadMedia({ type: "IMAGE", filename: file.name, mimeType: "image/jpeg", base64Data: await new File(file.uri).base64() });
      setArtworkId(saved.id);
      await queryClient.invalidateQueries({ queryKey: [scope, "media"] });
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  const visibleCards = cards
    .slice(0, Math.min(3, duration / 2))
    .map((text) => text.trim())
    .filter(Boolean);
  return (
    <Card tone="tint">
      <Txt variant="heading">{t("Motion Reel", "ريل متحرك")}</Txt>
      <Txt>
        {t(
          "Animate your artwork with a gentle zoom and exact text. No video AI fee.",
          "حرّك تصميمك بتقريب هادئ ونص دقيق، دون رسوم لتوليد الفيديو بالذكاء الاصطناعي."
        )}
      </Txt>
      {artwork ? (
        <>
          <Image source={{ uri: artwork.publicUrl }} style={{ height: 180, width: "100%" }} resizeMode="contain" accessibilityLabel={artwork.filename} />
          <Txt variant="meta">{artwork.filename}</Txt>
        </>
      ) : null}
      <Button secondary icon={Upload} disabled={locked} busy={busy} label={t("Upload JPEG artwork", "رفع تصميم JPEG")} onPress={() => void upload()} />
      <Button secondary disabled={locked || busy} label={t("Choose library artwork", "اختر تصميمًا من المكتبة")} onPress={() => setChoosing(!choosing)} />
      {choosing ? (
        <>
          {assets
            .filter((asset) => asset.mimeType === "image/jpeg")
            .map((asset) => (
              <Button
                key={asset.id}
                secondary
                disabled={locked || busy}
                label={asset.filename}
                onPress={() => {
                  setArtworkId(asset.id);
                  setChoosing(false);
                }}
              />
            ))}
          {!assets.some((asset) => asset.mimeType === "image/jpeg") ? <Txt>{t("Upload a JPEG to get started.", "ارفع صورة JPEG للبدء.")}</Txt> : null}
        </>
      ) : null}
      {cards.slice(0, Math.min(3, duration / 2)).map((text, index) => (
        <Field
          key={index}
          label={`${t("Text card", "بطاقة نصية")} ${index + 1} · ${t("optional", "اختياري")}`}
          value={text}
          multiline
          maxLength={160}
          editable={!locked && !busy}
          onChangeText={(value) => setCards((current) => current.map((line, i) => (i === index ? value : line)))}
        />
      ))}
      <Txt variant="meta" muted>
        {t(
          "Use English and Arabic on separate lines. Leave cards empty to preserve only the text already in your design.",
          "اكتب الإنجليزية والعربية في سطرين منفصلين. اترك البطاقات فارغة للاكتفاء بالنص الموجود في تصميمك."
        )}
      </Txt>
      {error ? <Notice error>{error}</Notice> : null}
      {!restored && error ? (
        <Button secondary label={t("Retry saved settings", "إعادة محاولة استعادة الإعدادات")} onPress={() => setAttempt((value) => value + 1)} />
      ) : null}
      <Button
        icon={Clapperboard}
        disabled={locked || !artwork}
        busy={busy}
        label={t("Create Motion Reel", "إنشاء ريل متحرك")}
        onPress={() => {
          if (!artwork) return;
          setBusy(true);
          setError("");
          void generate({ artworkMediaAssetId: artwork.id, textCards: visibleCards })
            .catch((e) => setError(errorMessage(e, t)))
            .finally(() => setBusy(false));
        }}
      />
    </Card>
  );
}
