import type { ContentRecord, NotificationRecord, PublishJobRecord } from "@markos/shared-types";
import { bahrainDate } from "../campaigns/brief-model";
type Translate = (en: string, ar: string) => string;
export function weekRange(offset = 0, now = new Date()) {
  const day = new Date(`${bahrainDate(now)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay() + offset * 7);
  const days = Array.from({ length: 7 }, (_, index) => new Date(day.getTime() + index * 86400000).toISOString().slice(0, 10));
  return { from: days[0]!, to: days[6]!, days };
}
export function placement(item: ContentRecord): string | undefined {
  return item.status === "PUBLISHED" ? item.publishedAt : ["SCHEDULED", "FAILED"].includes(item.status) ? item.scheduledAt : item.plannedAt;
}
export function groupCalendar(items: ContentRecord[]) {
  const groups = new Map<string, ContentRecord[]>();
  for (const item of items) {
    const time = placement(item);
    if (!time || !Number.isFinite(Date.parse(time))) continue;
    const key = bahrainDate(new Date(time));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, records]) => ({ day, items: records.sort((a, b) => Date.parse(placement(a)!) - Date.parse(placement(b)!)) }));
}
export const uncertainPublish = (code?: string) =>
  ["INSTAGRAM_PUBLISH_RESULT_UNKNOWN", "INSTAGRAM_PUBLISH_LEASE_LOST", "PUBLISH_WORKER_UNEXPECTED_ERROR"].includes(code ?? "");
export function publishingMessage(code: string | undefined, t: Translate): string {
  if (uncertainPublish(code))
    return t(
      "Instagram may have received this post. Check your Instagram account before scheduling it again to avoid a duplicate.",
      "قد يكون إنستغرام قد استلم هذا المنشور. تحقّق من حسابك قبل إعادة جدولته لتجنّب التكرار."
    );
  if (code?.includes("TOKEN") || code?.includes("RECONNECT") || code === "INSTAGRAM_NOT_CONNECTED")
    return t("Reconnect Instagram, then choose a new publishing time.", "أعد ربط إنستغرام ثم اختر موعد نشر جديدًا.");
  if (code?.includes("LIMIT") || code?.includes("RATE"))
    return t("Instagram’s publishing limit was reached. Choose a later time.", "تم بلوغ حد النشر في إنستغرام. اختر موعدًا لاحقًا.");
  if (code?.includes("MEDIA") || code?.includes("CONTAINER"))
    return t(
      "Instagram could not process the media. Review the final file before trying again.",
      "تعذّر على إنستغرام معالجة الوسائط. راجع الملف النهائي قبل المحاولة مجددًا."
    );
  return t(
    "Publishing needs attention. Review the content and connection before choosing a new time.",
    "يحتاج النشر إلى معالجة. راجع المحتوى والاتصال قبل اختيار موعد جديد."
  );
}
export function publicationState(content: ContentRecord, job: PublishJobRecord | null) {
  if (content.status === "PUBLISHED") return "PUBLISHED";
  if (
    content.status === "SCHEDULED" &&
    job &&
    content.scheduledAt &&
    Date.parse(job.scheduledFor) === Date.parse(content.scheduledAt) &&
    ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status)
  )
    return job.status;
  return content.status;
}
export function publicationLabel(state: string, t: Translate) {
  if (state === "QUEUED") return t("Waiting to publish", "بانتظار النشر");
  if (state === "PROCESSING") return t("Publishing in progress", "جارٍ النشر");
  if (state === "RETRY_WAIT") return t("Waiting for another attempt", "بانتظار محاولة أخرى");
  if (state === "FAILED") return t("Needs attention", "يحتاج انتباهك");
  if (state === "PUBLISHED") return t("Published on Instagram", "تم النشر على إنستغرام");
  if (state === "SCHEDULED") return t("Scheduled", "مجدول");
  return t("Not scheduled", "غير مجدول");
}
export function notificationPresentation(item: NotificationRecord, t: Translate) {
  const id = item.payload.contentItemId;
  const publishing = ["publishing_failed", "publishing_succeeded"].includes(item.templateKey);
  const contentId = publishing && typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
  if (item.templateKey === "publishing_failed")
    return {
      title: t("A post needs your attention", "منشور يحتاج انتباهك"),
      message: publishingMessage(typeof item.payload.errorCode === "string" ? item.payload.errorCode : undefined, t),
      contentId
    };
  if (item.templateKey === "publishing_succeeded")
    return {
      title: t("Published on Instagram", "تم النشر على إنستغرام"),
      message: t("Your approved content was published successfully.", "تم نشر المحتوى المعتمد بنجاح."),
      contentId
    };
  return {
    title: typeof item.payload.title === "string" ? item.payload.title : t("Workspace update", "تحديث مساحة العمل"),
    message: typeof item.payload.message === "string" ? item.payload.message : "",
    contentId: undefined
  };
}
export function percentageChange(value: number | null | undefined, locale: string) {
  return value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}
