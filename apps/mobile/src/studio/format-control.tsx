import React, { useState } from "react";
import { View } from "react-native";
import type { ContentRecord, ContentType } from "@markos/shared-types";
import type { ContentConversionResult } from "@markos/api-client";
import { useAccount, useAppearance } from "../providers";
import { Button, Card, Row, Txt } from "../ui";
import { typeLabel } from "../content";

export function FormatControl({
  item,
  disabled,
  save,
  accept,
  run
}: {
  item: ContentRecord;
  disabled: boolean;
  save: () => Promise<ContentRecord>;
  accept: (item: ContentRecord) => void;
  run: (work: () => Promise<void>) => Promise<void>;
}) {
  const { api } = useAccount();
  const { t } = useAppearance();
  const [preview, setPreview] = useState<ContentConversionResult | null>(null);
  const [open, setOpen] = useState(false);
  async function convert(type: ContentType, confirm = false, retain?: string) {
    await run(async () => {
      const saved = await save();
      const result = await api.convertContent(item.id, {
        contentType: type,
        expectedRevision: saved.revision,
        confirmDestructive: confirm && saved.revision === preview?.content.revision,
        ...(retain ? { retainMediaItemId: retain } : {})
      });
      if (result.applied) {
        accept(result.content);
        setPreview(null);
        setOpen(false);
      } else setPreview(result);
    });
  }
  if (!open && !preview) return <Button secondary disabled={disabled} label={t("Change content format", "تغيير نوع المحتوى")} onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Txt variant="label">{t("Content format", "نوع المحتوى")}</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        {(["POST", "CAROUSEL", "REEL", "STORY"] as const).map((type) => (
          <View key={type} style={{ flexGrow: 1, flexBasis: "40%" }}>
            <Button
              secondary={item.contentType !== type}
              label={typeLabel(type, t)}
              disabled={disabled || type === item.contentType}
              onPress={() => void convert(type)}
            />
          </View>
        ))}
      </Row>
      {!preview ? <Button secondary label={t("Done", "تم")} onPress={() => setOpen(false)} /> : null}
      {preview ? (
        <Card tone="warning">
          <Txt variant="heading">{t("Review the format change", "راجع تغيير نوع المحتوى")}</Txt>
          <Txt>
            {t(
              `Change to ${typeLabel(preview.preview.to, t)}. ${preview.preview.removedItemIds.length} media slots will be removed and ${preview.preview.detachedAssetIds.length} attachments detached. Saved files stay in your library.`,
              `التغيير إلى ${typeLabel(preview.preview.to, t)}. ستُزال ${preview.preview.removedItemIds.length} من خانات الوسائط وتُفصل ${preview.preview.detachedAssetIds.length} مرفقات. تبقى الملفات المحفوظة في المكتبة.`
            )}
          </Txt>
          {preview.preview.resetFields.includes("reelScript") ? (
            <Txt>{t("The Reel script will be removed from this draft.", "سيُزال نص الريل من هذه المسودة.")}</Txt>
          ) : null}
          {preview.preview.requiresSelection ? (
            <>
              <Txt>{t("Choose the slide to keep.", "اختر الشريحة التي تريد الاحتفاظ بها.")}</Txt>
              {preview.content.mediaItems.map((media, index) => (
                <Button
                  key={media.id}
                  secondary
                  disabled={disabled}
                  label={`${index + 1} · ${media.title || t("Untitled slide", "شريحة بلا عنوان")}`}
                  onPress={() => void convert(preview.preview.to, false, media.id)}
                />
              ))}
            </>
          ) : (
            <Button
              disabled={disabled}
              label={t("Confirm format change", "تأكيد تغيير النوع")}
              onPress={() => void convert(preview.preview.to, true, preview.preview.retainedItemId ?? undefined)}
            />
          )}
          <Button
            secondary
            disabled={disabled}
            label={t("Keep current format", "إبقاء النوع الحالي")}
            onPress={() => {
              setPreview(null);
              setOpen(false);
            }}
          />
        </Card>
      ) : null}
    </Card>
  );
}
