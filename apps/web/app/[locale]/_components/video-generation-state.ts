import type { Locale, MediaGenerationJobRecord } from "@markos/shared-types";

export const runningVideoGeneration = (job: MediaGenerationJobRecord | null) =>
  !!job && ["QUEUED", "STARTING", "GENERATING", "PROCESSING"].includes(job.status);

export function videoGenerationMessage(job: MediaGenerationJobRecord, locale: Locale): string {
  const ar = locale === "ar";
  if (runningVideoGeneration(job)) {
    return ar ? `جارٍ توليد الفيديو… ${job.progress}%` : `Video generation in progress… ${job.progress}%`;
  }
  if (job.status === "COMPLETED") {
    return job.attachmentApplied
      ? ar
        ? "أُرفق الفيديو."
        : "Video attached."
      : ar
        ? "حُفظ الفيديو في المكتبة دون تغيير المسودة الأحدث."
        : "Video saved to Library; newer draft preserved.";
  }
  if (["moderation_blocked", "content_policy_violation", "AI_VIDEO_MODERATION_BLOCKED"].includes(job.errorCode ?? "")) {
    return ar
      ? "رفض مزوّد الفيديو هذا الطلب بسبب سياسة المحتوى. غيّر التوجيه البصري أو ارفع فيديو."
      : "The video provider blocked this request under its content policy. Change the visual direction or upload a video.";
  }
  return job.errorMessage || (ar ? "توقف توليد الفيديو." : "Video generation stopped.");
}
