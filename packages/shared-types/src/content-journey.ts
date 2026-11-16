import type { ContentRecord, Locale, MediaAssetRecord } from "./index";
import { captionValidationIssue } from "./content-caption";
import { contentMediaIssue } from "./content-media";

export type DraftReadinessIssue = "caption" | "caption-invalid" | "media" | "carousel" | "loading" | "incompatible";
export function contentReadinessIssue(item: ContentRecord, assets: MediaAssetRecord[] | undefined): DraftReadinessIssue | null {
  if (item.contentType !== "STORY" && !item.caption.trim()) return "caption";
  if (captionValidationIssue(item.caption)) return "caption-invalid";
  if (item.contentType === "CAROUSEL" && item.mediaItems.length < 2) return "carousel";
  if (!item.mediaItems.length || item.mediaItems.some((media) => !media.mediaAssetId)) return "media";
  if (!assets) return "loading";
  if (
    contentMediaIssue(
      item.contentType,
      item.mediaItems.map((media) => media.mediaAssetId!),
      assets,
      true
    )
  )
    return "incompatible";
  return item.mediaItems.some(
    (media) =>
      assets.find((asset) => asset.id === media.mediaAssetId)?.mimeType !==
      (media.mediaKind === "VIDEO" ? "video/mp4" : media.mediaKind === "IMAGE" ? "image/jpeg" : "")
  )
    ? "incompatible"
    : null;
}

/** UI guidance comes from the saved lifecycle and actual attachments, never an invented chat turn. */
export function contentJourney(
  item: ContentRecord,
  locale: Locale,
  issue: DraftReadinessIssue | null,
  state: { working?: boolean; publishing?: boolean; publishingFailed?: boolean } = {}
) {
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const origin = item.campaignId
    ? t("Campaign post", "منشور من الحملة") + (item.campaignWeek ? t(` · Week ${item.campaignWeek}`, ` · الأسبوع ${item.campaignWeek}`) : "")
    : "";
  const planned =
    item.plannedAt && Number.isFinite(Date.parse(item.plannedAt)) && ["DRAFT", "IN_REVIEW", "APPROVED"].includes(item.status)
      ? t("Planned for ", "مخطط ليوم ") + new Date(item.plannedAt).toLocaleDateString(locale, { timeZone: "Asia/Bahrain", dateStyle: "medium" })
      : "";
  const context = [origin, planned].filter(Boolean).join(" · ");
  if (item.status === "PUBLISHED")
    return {
      stage: "PUBLISHED",
      context,
      title: t("Your post is published", "تم نشر منشورك"),
      detail: t(
        "Instagram confirmed publication. Open Insights to follow its performance as data arrives.",
        "أكّد إنستغرام النشر. افتح الأداء لمتابعة النتائج عند توفّر البيانات."
      ),
      action: "INSIGHTS"
    } as const;
  if (state.publishing)
    return {
      stage: "PUBLISHING",
      context,
      title: t("Your post is being published", "جارٍ نشر منشورك"),
      detail: t(
        "Instagram is processing it. You can leave this screen; I’ll keep track of the result.",
        "يعالج إنستغرام المنشور. يمكنك مغادرة الشاشة؛ سأتابع النتيجة."
      ),
      action: "WAIT"
    } as const;
  if (item.status === "SCHEDULED")
    return {
      stage: "SCHEDULED",
      context,
      title: t("Your post is scheduled", "تمت جدولة منشورك"),
      detail: t(
        "MARKOS will publish at your confirmed time, even while you’re away. Manage the time in Calendar.",
        "سينشر ماركوس في الموعد الذي أكّدته، حتى أثناء غيابك. يمكنك إدارة الموعد من التقويم."
      ),
      action: "CALENDAR"
    } as const;
  if (item.status === "FAILED" || state.publishingFailed)
    return {
      stage: "FAILED",
      context,
      title: t("Publishing needs your attention", "النشر يحتاج إلى انتباهك"),
      detail: t(
        "Check the publishing result and your Instagram account before choosing a new time or trying again.",
        "تحقّق من نتيجة النشر وحسابك على إنستغرام قبل اختيار موعد جديد أو المحاولة مجددًا."
      ),
      action: "RECOVERY"
    } as const;
  if (state.working)
    return {
      stage: "WORKING",
      context,
      title: t("I’m preparing this draft", "أعمل على إعداد هذه المسودة"),
      detail: t(
        "I’m working on your request. When it finishes, review the caption and media here before marking the post Ready.",
        "أعمل على طلبك. بعد اكتماله راجع النص والوسائط هنا قبل اعتماد المنشور."
      ),
      action: "WAIT"
    } as const;
  if (item.status === "APPROVED")
    return {
      stage: "READY",
      context,
      title: t("Your post is ready to publish", "منشورك جاهز للنشر"),
      detail: t(
        "Choose Schedule or Publish now below. To change the caption or design first, choose Edit post. Nothing has been posted yet.",
        "اختر جدولة أو نشر الآن أدناه. لتغيير النص أو التصميم أولًا، اختر تعديل المنشور. لم يُنشر شيء بعد."
      ),
      action: "PUBLISH"
    } as const;
  const empty = !item.caption.trim() && !item.mediaItems.some((media) => media.mediaAssetId);
  if (empty)
    return {
      stage: "START",
      context,
      title: item.campaignId ? t("Let’s create this campaign post", "لنُعدّ هذا المنشور من حملتك") : t("Let’s prepare your draft", "لنُعدّ مسودتك"),
      detail: item.campaignId
        ? t(
            "The campaign idea and planning details are already here. I’ll prepare the caption and media for you to review. This does not schedule or publish it.",
            "فكرة الحملة وتفاصيل التخطيط موجودة هنا. سأعدّ النص والوسائط لتراجعها، دون جدولة أو نشر."
          )
        : t(
            "I’ll use your brief and saved business knowledge to prepare the caption and media. You’ll review the result before anything is published.",
            "سأستخدم ملخصك وما أعرفه عن نشاطك لإعداد النص والوسائط. ستراجع النتيجة قبل نشر أي شيء."
          ),
      action: "PREPARE"
    } as const;
  if (issue)
    return {
      stage: "INCOMPLETE",
      context,
      title: t("Let’s finish this draft", "لنُكمل هذه المسودة"),
      detail:
        issue === "caption-invalid"
          ? t("The caption needs shortening before approval. Open the caption to make that change.", "يحتاج النص إلى الاختصار قبل الاعتماد. افتح النص لتعديله.")
          : issue === "caption"
            ? t(
                "The media is here. I can prepare the missing caption while keeping your existing design.",
                "الوسائط موجودة. يمكنني إعداد النص الناقص مع الحفاظ على التصميم الحالي."
              )
            : issue === "loading"
              ? t("I’m checking the attached media before the next step.", "أتحقّق من الوسائط المرفقة قبل الخطوة التالية.")
              : t(
                  "The draft still needs its final media. Complete or replace the attachments, then review the whole post.",
                  "ما زالت المسودة تحتاج إلى الوسائط النهائية. أكمل المرفقات أو استبدلها، ثم راجع المنشور كاملًا."
                ),
      action: issue === "caption" ? "CAPTION" : issue === "caption-invalid" ? "EDIT_CAPTION" : issue === "loading" ? "WAIT" : "MEDIA"
    } as const;
  return {
    stage: "REVIEW",
    context,
    title: t("Your draft is created. Review it next.", "مسودتك جاهزة. راجعها الآن."),
    detail: t(
      "Check the preview, caption and event details. Tell me any changes, or choose Mark Ready when you’re happy. Scheduling and publishing come next.",
      "راجع المعاينة والنص وتفاصيل الفعالية. أخبرني بأي تعديلات، أو اعتمد المنشور عندما يناسبك. الجدولة والنشر هما الخطوة التالية."
    ),
    action: "REVIEW"
  } as const;
}

export function prepareDraftInstruction(item: ContentRecord, locale: Locale, captionOnly = false) {
  if (captionOnly)
    return locale === "ar"
      ? "أكمل النص الناقص باستخدام الملخص وتفاصيل الحملة. حافظ على الوسائط والتصميم الموجودين دون تغيير."
      : "Write the missing caption using the brief and campaign details. Keep the existing media and design unchanged.";
  return locale === "ar"
    ? "أعدّ نص ووسائط هذه المسودة باستخدام ملخصها وتفاصيل حملتها. حافظ على نوع المحتوى واتركها مسودة لأراجعها."
    : `Create the caption and generate the media for this ${item.contentType.toLowerCase()} using its brief and campaign details. Keep its format and leave it as a draft for my review.`;
}
