import type { AuthSession, InstagramOAuthStart, PublishReadiness, PublishingLiveReadiness, Role } from "@markos/shared-types";

export const canManageInstagram = (roles: Role[]) => roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role));
export const canScheduleContent = (roles: Role[]) =>
  roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "SUPER_ADMIN", "PRODUCT_ADMIN", "EDITOR"].includes(role));
export const mfaActive = (session: AuthSession, now = Date.now()) => session.mfaVerified === true && (session.mfaVerifiedUntil ?? 0) * 1000 > now;
export const authenticatorCode = (value: string) =>
  value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
    .replace(/\D/g, "")
    .slice(0, 6);

/** Only open the provider's HTTPS consent page. Tokens never enter a native return link. */
export function authorizationUrl(start: InstagramOAuthStart, apiUrl: string, now = Date.now()): string {
  const url = new URL(start.authorizationUrl);
  const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.instagram.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/oauth\/authorize\/?$/.test(url.pathname) ||
    !url.searchParams.get("state") ||
    redirect.origin !== new URL(apiUrl).origin ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== "/v1/workspace/instagram/oauth/callback" ||
    !Number.isFinite(Date.parse(start.stateExpiresAt)) ||
    Date.parse(start.stateExpiresAt) <= now
  )
    throw new Error("INSTAGRAM_AUTHORIZATION_INVALID");
  return url.toString();
}

/** The proposed date/status replace the endpoint's checks against an existing schedule only. */
export function scheduleBlockers(readiness: PublishReadiness, live: PublishingLiveReadiness, revision: number): string[] {
  const reasons = [...readiness.reasons.filter((reason) => !["CONTENT_NOT_SCHEDULED", "SCHEDULE_TIME_NOT_IN_FUTURE"].includes(reason)), ...live.reasons];
  if (!readiness.contentItem || !["APPROVED", "SCHEDULED", "FAILED"].includes(readiness.contentItem.status)) reasons.push("CONTENT_NOT_READY");
  if (readiness.contentItem?.revision !== revision) reasons.push("CONTENT_REVISION_CONFLICT");
  if (!readiness.connection.connected || !live.connection.connected) reasons.push("INSTAGRAM_NOT_CONNECTED");
  if (live.mode !== "live") reasons.push("INSTAGRAM_PUBLISH_MODE_NOT_LIVE");
  if (!live.ready && !live.reasons.length) reasons.push("PUBLISHING_UNAVAILABLE");
  if (!readiness.ready && !readiness.reasons.length) reasons.push("PUBLISHING_UNAVAILABLE");
  return [...new Set(reasons)];
}

export function readinessMessage(reason: string, t: (en: string, ar: string) => string): string {
  switch (reason) {
    case "INSTAGRAM_NOT_CONNECTED":
      return t("Connect your Instagram professional account.", "اربط حساب إنستغرام الاحترافي.");
    case "INSTAGRAM_TOKEN_EXPIRED":
    case "INSTAGRAM_RECONNECT_REQUIRED_FOR_RELEASE_SCOPES":
      return t("Reconnect Instagram to renew its publishing permission.", "أعد ربط إنستغرام لتجديد إذن النشر.");
    case "INSTAGRAM_PUBLISH_MODE_NOT_LIVE":
      return t("Automatic publishing is not enabled for this workspace yet.", "النشر التلقائي غير مفعّل لهذه المساحة بعد.");
    case "CONTENT_NOT_READY":
      return t("Review the draft and mark it Ready first.", "راجع المسودة واعتمدها أولًا.");
    case "CONTENT_REVISION_CONFLICT":
      return t("This content changed. Reopen the draft and review it before scheduling.", "تغيّر المحتوى. أعد فتح المسودة وراجعها قبل الجدولة.");
    case "CONTENT_CAPTION_REQUIRED":
      return t("Add a caption before scheduling.", "أضف نصًا قبل الجدولة.");
    case "CONTENT_CAPTION_TOO_LONG":
      return t("Shorten the caption to Instagram’s supported length.", "اختصر النص إلى الطول المسموح في إنستغرام.");
    case "CONTENT_CAPTION_TOO_MANY_HASHTAGS":
      return t("Reduce the number of hashtags in the caption.", "قلّل عدد الوسوم في النص.");
    case "CONTENT_MEDIA_CAROUSEL_MINIMUM":
      return t("Attach at least two JPEG images to this carousel.", "أرفق صورتين بصيغة JPEG على الأقل لهذا المنشور المتعدد.");
    case "CONTENT_MEDIA_TYPE_INCOMPATIBLE":
      return t("Use JPEG for images and MP4 for Reels.", "استخدم JPEG للصور وMP4 للريلز.");
    case "CONTENT_MEDIA_REQUIRED":
    case "CONTENT_MEDIA_UNAVAILABLE":
    case "PUBLIC_MEDIA_REQUIRED":
      return t("Reattach the final media so Instagram can access it when publishing.", "أعد إرفاق الوسائط النهائية ليتمكن إنستغرام من الوصول إليها عند النشر.");
    default:
      return t(
        "Publishing needs attention. Contact the workspace administrator before scheduling.",
        "يحتاج النشر إلى معالجة. تواصل مع مسؤول مساحة العمل قبل الجدولة."
      );
  }
}
