import React, { useState } from "react";
import { View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { IconButton, Row, TextAction, Txt } from "../ui";
import { MediaPreview } from "./media-preview";

export function PostPreview({ item, assets }: { item: ContentRecord; assets: MediaAssetRecord[] }) {
  const { colors, t } = useAppearance();
  const [selectedId, setSelectedId] = useState<string>(),
    [expanded, setExpanded] = useState(false);
  const mediaItems = [...item.mediaItems].sort((a, b) => a.position - b.position);
  const index = Math.max(
    0,
    mediaItems.findIndex((media) => media.id === selectedId)
  );
  const selected = mediaItems[index],
    asset = assets.find((entry) => entry.id === selected?.mediaAssetId);
  const gallery = mediaItems.flatMap((media) => {
    const asset = assets.find((entry) => entry.id === media.mediaAssetId);
    return asset ? [asset] : [];
  });
  return (
    <View style={{ gap: 12 }} accessibilityLabel={t("Content preview", "معاينة المحتوى")}>
      {asset ? (
        <MediaPreview key={asset.id} asset={asset} gallery={gallery} canvas portrait={item.contentType === "STORY" || item.contentType === "REEL"} />
      ) : (
        <View style={{ minHeight: 240, padding: 24, borderRadius: 16, backgroundColor: colors.surfaceMuted, justifyContent: "center" }}>
          <Txt muted>{t("Media has not been generated or attached yet.", "لم تُنشأ الوسائط أو تُرفق بعد.")}</Txt>
        </View>
      )}
      {item.contentType === "CAROUSEL" && mediaItems.length > 1 ? (
        <Row style={{ justifyContent: "center" }}>
          <IconButton
            icon={ChevronLeft}
            label={t("Previous slide", "الشريحة السابقة")}
            disabled={index === 0}
            onPress={() => setSelectedId(mediaItems[index - 1]!.id)}
          />
          <Txt variant="meta" muted>
            {index + 1} / {mediaItems.length}
          </Txt>
          <IconButton
            icon={ChevronRight}
            label={t("Next slide", "الشريحة التالية")}
            disabled={index === mediaItems.length - 1}
            onPress={() => setSelectedId(mediaItems[index + 1]!.id)}
          />
        </Row>
      ) : null}
      {item.contentType !== "STORY" && item.caption ? (
        <View>
          <Txt selectable numberOfLines={expanded ? undefined : 4}>
            {item.caption}
          </Txt>
          {item.caption.length > 140 ? (
            <TextAction label={expanded ? t("Show less", "عرض أقل") : t("Read full caption", "قراءة النص كاملًا")} onPress={() => setExpanded(!expanded)} />
          ) : null}
        </View>
      ) : item.contentType === "STORY" && item.caption ? (
        <Txt muted>
          {t(
            "Story supporting text stays in your draft. Only the image or video is published.",
            "يبقى النص المساند للقصة في المسودة. تُنشر الصورة أو الفيديو فقط."
          )}
        </Txt>
      ) : null}
    </View>
  );
}
