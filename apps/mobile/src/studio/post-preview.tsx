import React from "react";
import { View } from "react-native";
import { Heart, MessageCircle, Send, Bookmark } from "lucide-react-native";
import type { ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Card, Row, Txt } from "../ui";
import { MediaPreview } from "./media-preview";
import { typeLabel } from "../content";

export function PostPreview({ item, assets }: { item: ContentRecord; assets: MediaAssetRecord[] }) {
  const { colors, t } = useAppearance();
  return (
    <Card>
      <Txt variant="heading">{t("Full post preview", "معاينة المنشور كاملًا")}</Txt>
      <Txt variant="meta" muted>
        {typeLabel(item.contentType, t)} · Instagram
      </Txt>
      {item.mediaItems.map((media, index) => {
        const asset = assets.find((entry) => entry.id === media.mediaAssetId);
        return (
          <View key={media.id} style={{ gap: 8 }}>
            {item.contentType === "CAROUSEL" ? (
              <Txt variant="label">
                {index + 1} / {item.mediaItems.length}
              </Txt>
            ) : null}
            {asset ? (
              <MediaPreview asset={asset} portrait={item.contentType === "STORY" || item.contentType === "REEL"} />
            ) : (
              <Txt muted>{t("Media has not been generated or attached yet.", "لم تُنشأ الوسائط أو تُرفق بعد.")}</Txt>
            )}
          </View>
        );
      })}
      {item.contentType !== "STORY" ? (
        <>
          <Row>
            <Heart size={22} color={colors.text} />
            <MessageCircle size={22} color={colors.text} />
            <Send size={22} color={colors.text} />
            <View style={{ flex: 1 }} />
            <Bookmark size={22} color={colors.text} />
          </Row>
          <Txt selectable>{item.caption || t("Your caption will appear here.", "سيظهر النص هنا.")}</Txt>
        </>
      ) : (
        <Txt muted>
          {t(
            "Story supporting text stays in your draft. Only the image or video is published.",
            "يبقى النص المساند للقصة في المسودة. تُنشر الصورة أو الفيديو فقط."
          )}
        </Txt>
      )}
      <Txt variant="meta" muted>
        {t("Preview only. Nothing is published until you approve and schedule it.", "معاينة فقط. لن يُنشر شيء حتى تعتمد المحتوى وتجدوله.")}
      </Txt>
    </Card>
  );
}
