import { MarkosApiError } from "@markos/api-client";
export class LocalAppError extends Error {}
export function errorMessage(error: unknown, t: (en: string, ar: string) => string): string {
  if (error instanceof LocalAppError) return error.message;
  const code = error instanceof MarkosApiError ? error.code : undefined;
  switch (code) {
    case "SETTINGS_REVISION_CONFLICT":
      return t(
        "These details changed elsewhere. Reload saved details before trying again.",
        "تغيّرت هذه البيانات في مكان آخر. أعد تحميل البيانات المحفوظة قبل المحاولة مجددًا."
      );
    case "TEAM_INVITATION_INVALID":
      return t(
        "This invitation is expired, revoked, used, or issued to another email. Ask the owner for a new code.",
        "انتهت صلاحية الدعوة أو أُلغيت أو استُخدمت أو صدرت لبريد آخر. اطلب رمزًا جديدًا من المالك."
      );
    case "TEAM_OWNER_REQUIRED":
    case "TEAM_OWNER_PROTECTED":
    case "TEAM_SELF_CHANGE":
      return t("Ask the workspace owner to make this access change.", "اطلب من مالك مساحة العمل إجراء هذا التغيير في الصلاحيات.");
    case "TEAM_INVITATION_NOT_FOUND":
    case "TEAM_MEMBER_NOT_FOUND":
      return t("Team access changed elsewhere. Reload this page.", "تغيّرت صلاحيات الفريق في مكان آخر. أعد تحميل هذه الصفحة.");
    case "TEAM_INVITE_LIMIT":
      return t("Revoke unused invitations before creating more.", "ألغِ الدعوات غير المستخدمة قبل إنشاء المزيد.");
    case "WORKSPACE_FORBIDDEN":
      return t("This workspace is no longer available to your account.", "لم تعد مساحة العمل هذه متاحة لحسابك.");
    case "EMAIL_ALREADY_EXISTS":
      return t("An account already uses this email. Log in or recover your password.", "يوجد حساب بهذا البريد. سجّل الدخول أو استعد كلمة المرور.");
    case "PASSWORD_RESET_INVALID":
      return t(
        "The code is invalid, expired or already used. Request a new code and use it on this screen.",
        "الرمز غير صحيح أو منتهي الصلاحية أو مستخدم. اطلب رمزًا جديدًا واستخدمه على هذه الشاشة."
      );
    case "AUTH_RATE_LIMITED":
      return t("Too many attempts. Wait before requesting another code or trying again.", "محاولات كثيرة. انتظر قبل طلب رمز آخر أو المحاولة مجددًا.");
    case "CONTENT_REVISION_CONFLICT":
      return t(
        "This draft changed elsewhere. Review the latest version before saving or scheduling.",
        "تغيّرت هذه المسودة في مكان آخر. راجع النسخة الأحدث قبل الحفظ أو الجدولة."
      );
    case "KNOWLEDGE_REVISION_CONFLICT":
      return t(
        "Your business details changed elsewhere. Review the latest profile before saving again.",
        "تغيّرت تفاصيل نشاطك في مكان آخر. راجع أحدث ملف قبل الحفظ مجددًا."
      );
    case "CONTENT_CAPTION_REQUIRED":
      return t("Add a caption before marking this content ready.", "أضف نصًا قبل اعتماد هذا المحتوى.");
    case "CONTENT_MEDIA_REQUIRED":
      return t("Attach media to every slot before marking ready.", "أرفق وسائط بكل خانة قبل الاعتماد.");
    case "CONTENT_MEDIA_CAROUSEL_MINIMUM":
      return t("A carousel needs at least two finished slides.", "يحتاج المنشور المتعدد إلى شريحتين مكتملتين على الأقل.");
    case "CONTENT_MEDIA_TYPE_INCOMPATIBLE":
    case "MEDIA_UPLOAD_INVALID":
      return t(
        "Use an Instagram-compatible JPEG for images or MP4 for Reels. Check the file size and dimensions.",
        "استخدم JPEG متوافقًا مع إنستغرام للصور أو MP4 للريل. تحقّق من حجم الملف وأبعاده."
      );
    case "CONTENT_LOCKED":
    case "CONTENT_STATUS_TRANSITION_INVALID":
      return t("Return this content to Draft before editing it.", "أعد هذا المحتوى إلى المسودة قبل تعديله.");
    case "MEDIA_DIRECTION_REQUIRED":
      return t("Add a visual direction before generating media.", "أضف توجّهًا بصريًا قبل إنشاء الوسائط.");
    case "CONTENT_SCHEDULE_INVALID":
      return t("Check that the content is ready and choose a future publishing time.", "تأكّد من اعتماد المحتوى واختر موعد نشر في المستقبل.");
    case "CONVERSATION_BUSY":
      return t("MARKOS is finishing the previous message. Check the conversation shortly.", "ماركوس يكمل الرسالة السابقة. تحقّق من المحادثة بعد قليل.");
    case "AI_VIDEO_MODERATION_BLOCKED":
      return t(
        "The video provider declined this direction. Revise the concept or upload your own video.",
        "رفض مزوّد الفيديو هذا التوجّه. عدّل الفكرة أو ارفع فيديو من جهازك."
      );
    case "INVALID_CREDENTIALS":
      return t("That email and password didn’t match. Try again.", "البريد الإلكتروني أو كلمة المرور غير صحيحة. حاول مرة أخرى.");
    case "MFA_REQUIRED":
    case "MFA_INVALID":
      return t("Enter the six-digit code from your authenticator app.", "أدخل الرمز المكوّن من ستة أرقام من تطبيق المصادقة.");
    case "MFA_SETUP_REQUIRED":
      return t("Set up an authenticator in Account security before continuing.", "أعِدّ تطبيق المصادقة في أمان الحساب قبل المتابعة.");
    case "MFA_ALREADY_ENABLED":
    case "MFA_SETUP_MISSING":
      return t("Authenticator settings changed. Reopen Account security and try again.", "تغيّرت إعدادات المصادقة. أعد فتح أمان الحساب وحاول مجددًا.");
    case "EMAIL_NOT_VERIFIED":
    case "EMAIL_VERIFICATION_REQUIRED":
      return t("Verify your email on MARKOS web, then try again.", "تحقّق من بريدك الإلكتروني على موقع ماركوس، ثم حاول مجددًا.");
    case "CAMPAIGN_CONTEXT_MISSING":
    case "BUSINESS_PROFILE_REQUIRED":
      return t("Complete your business profile before drafting a campaign.", "أكمل ملف نشاطك التجاري قبل إنشاء الحملة.");
    case "AI_PROVIDER_TIMEOUT":
      return t(
        "Generation took too long. Check your campaigns before trying again; your brief is still saved.",
        "استغرق الإنشاء وقتًا طويلًا. تحقّق من حملاتك قبل المحاولة مجددًا؛ ملخصك محفوظ."
      );
    case "AI_PROVIDER_RATE_LIMIT":
    case "AI_PROVIDER_UNAVAILABLE":
      return t(
        "The AI service is unavailable right now. Your brief is saved; try again shortly.",
        "خدمة الذكاء الاصطناعي غير متاحة الآن. ملخصك محفوظ؛ حاول بعد قليل."
      );
    case "FORBIDDEN":
    case "INSUFFICIENT_ROLE":
    case "RBAC_FORBIDDEN":
      return t("Your workspace role doesn’t allow this action.", "دورك في مساحة العمل لا يسمح بهذا الإجراء.");
    case "VALIDATION_ERROR":
      return t("Check the details and file limits, then try again.", "تحقّق من التفاصيل وحدود الملفات، ثم حاول مجددًا.");
    case "NATIVE_SESSION_REQUEST_REQUIRED":
      return t("The sign-in service needs an update. Please reopen the app.", "تحتاج خدمة تسجيل الدخول إلى تحديث. أعد فتح التطبيق.");
  }
  if (error instanceof MarkosApiError && error.status === 401) return t("Your session has ended. Sign in again.", "انتهت جلستك. سجّل الدخول مجددًا.");
  return t("We couldn’t complete the request. Check your connection and try again.", "تعذّر إكمال الطلب. تحقّق من اتصالك وحاول مرة أخرى.");
}
