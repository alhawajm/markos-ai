import React from "react";
import { View } from "react-native";
import type { ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Button, Card, Txt } from "../ui";
import { draftReadiness } from "./workflow";

export function Readiness({
  item,
  assets,
  busy,
  open
}: {
  item: ContentRecord;
  assets?: MediaAssetRecord[];
  busy: boolean;
  open: (section: "assistant" | "caption" | "media" | "review") => void;
}) {
  const { t } = useAppearance();
  const issue = draftReadiness(item, assets);
  const caption = issue === "caption" || issue === "caption-invalid";
  const messages = {
    caption: t("First, prepare your caption. Ask MARKOS to draft it or write it yourself.", "أعدّ النص أولًا. اطلب من ماركوس صياغته أو اكتبه بنفسك."),
    "caption-invalid": t("Shorten the caption or reduce its hashtags before approval.", "اختصر النص أو قلّل الوسوم قبل الاعتماد."),
    carousel: t("Add at least two slides and generate or attach an image to each one.", "أضف شريحتين على الأقل وأنشئ أو أرفق صورة لكل شريحة."),
    media: t(
      "Your draft still needs media. Generate, upload or choose it from the library, then review the result.",
      "ما زالت مسودتك تحتاج إلى وسائط. أنشئها أو ارفعها أو اخترها من المكتبة، ثم راجع النتيجة."
    ),
    loading: t("Checking the attached media…", "جارٍ التحقّق من الوسائط المرفقة…"),
    incompatible: t(
      "One of the attachments is unavailable or does not match this format. Replace it in Media.",
      "أحد المرفقات غير متاح أو لا يناسب هذا النوع. استبدله في قسم الوسائط."
    )
  };
  return (
    <Card tone={issue ? "tint" : undefined}>
      <Txt variant="heading">{t("Prepare → Generate → Review → Ready", "إعداد ← إنشاء ← مراجعة ← اعتماد")}</Txt>
      <Txt>
        {issue
          ? messages[issue]
          : t("Caption and media are attached. Review the complete post before marking it ready.", "النص والوسائط مرفقان. راجع المنشور كاملًا قبل اعتماده.")}
      </Txt>
      <Txt variant="meta" muted>
        {t(
          "Mark ready approves your finished content. It does not generate or publish media.",
          "الاعتماد يؤكد جاهزية المحتوى النهائي. لا ينشئ الوسائط ولا ينشرها."
        )}
      </Txt>
      <View style={{ gap: 8 }}>
        <Button
          secondary
          disabled={busy || issue === "loading"}
          label={
            caption
              ? t("Prepare with MARKOS", "الإعداد مع ماركوس")
              : issue
                ? t("Generate or attach media", "إنشاء أو إرفاق وسائط")
                : t("Review full post", "مراجعة المنشور كاملًا")
          }
          onPress={() => open(caption ? "assistant" : issue ? "media" : "review")}
        />
        {caption ? <Button secondary disabled={busy} label={t("Write caption myself", "كتابة النص بنفسي")} onPress={() => open("caption")} /> : null}
      </View>
    </Card>
  );
}
