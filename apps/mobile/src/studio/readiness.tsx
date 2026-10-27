import React from "react";
import type { ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Card, TextAction, Txt } from "../ui";
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
    caption: t("Add a caption with MARKOS or write it yourself.", "أضف نصًا بمساعدة ماركوس أو اكتبه بنفسك."),
    "caption-invalid": t("Shorten the caption or reduce its hashtags before approval.", "اختصر النص أو قلّل الوسوم قبل الاعتماد."),
    carousel: t("Add at least two slides and generate or attach an image to each one.", "أضف شريحتين على الأقل وأنشئ أو أرفق صورة لكل شريحة."),
    media: t("Add media to continue. Generate it, upload a file or choose from your library.", "أضف وسائط للمتابعة. أنشئها أو ارفع ملفًا أو اختر من مكتبتك."),
    loading: t("Checking the attached media…", "جارٍ التحقّق من الوسائط المرفقة…"),
    incompatible: t(
      "One of the attachments is unavailable or does not match this format. Replace it in Media.",
      "أحد المرفقات غير متاح أو لا يناسب هذا النوع. استبدله في قسم الوسائط."
    )
  };
  return (
    <Card tone={issue ? "tint" : undefined}>
      <Txt variant="label">{issue ? t("Next step", "الخطوة التالية") : t("Ready for your review", "جاهز للمراجعة")}</Txt>
      <Txt>
        {issue
          ? messages[issue]
          : t("Caption and media are attached. Review the complete post before marking it ready.", "النص والوسائط مرفقان. راجع المنشور كاملًا قبل اعتماده.")}
      </Txt>
      {caption ? <TextAction disabled={busy} label={t("Write caption myself", "كتابة النص بنفسي")} onPress={() => open("caption")} /> : null}
    </Card>
  );
}
