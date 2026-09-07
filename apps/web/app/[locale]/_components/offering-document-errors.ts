import type { Locale } from "@markos/shared-types";

const nonRetryableFailureCodes = new Set([
  "AI_DOCUMENT_INVALID",
  "AI_DOCUMENT_UNREADABLE",
  "AI_DOCUMENT_UNSUPPORTED",
  "AI_OUTPUT_REFUSED",
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_PROVIDER_USAGE_MISSING",
  "AI_SERVICE_AUTHENTICATION_FAILED",
  "AI_SERVICE_UNAUTHORIZED"
]);

const temporaryFailureCodes = new Set([
  "AI_OUTPUT_INCOMPLETE",
  "AI_OUTPUT_INVALID",
  "AI_PROVIDER_RATE_LIMITED",
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_SERVICE_RESPONSE_INVALID",
  "AI_SERVICE_TIMEOUT",
  "AI_SERVICE_UNAVAILABLE",
  "OFFERING_DOCUMENT_ANALYSIS_INTERRUPTED"
]);

export function canRetryOfferingDocumentFailure(code?: string): boolean {
  return code === undefined || !nonRetryableFailureCodes.has(code);
}

export function offeringDocumentFailureMessage(locale: Locale, code?: string): string {
  if (locale === "ar") {
    if (code === "AI_PROVIDER_NOT_CONFIGURED" || code === "AI_SERVICE_AUTHENTICATION_FAILED" || code === "AI_SERVICE_UNAUTHORIZED") {
      return "تحليل المستندات بالذكاء الاصطناعي غير متصل الآن. أدخل منتجاتك وخدماتك يدوياً، أو حاول مجدداً بعد تفعيل الخدمة.";
    }
    if (code === "AI_DOCUMENT_UNREADABLE") {
      return "لم يجد MARKOS نصاً قابلاً للقراءة في الملفات. ارفع ملف PDF نصياً أو DOCX أو TXT، أو تابع يدوياً.";
    }
    if (code === "AI_DOCUMENT_INVALID" || code === "AI_DOCUMENT_UNSUPPORTED") {
      return "تعذر معالجة الملفات بأمان. احذفها وارفع ملف PDF نصياً أو DOCX أو TXT، أو تابع يدوياً.";
    }
    if (code === "AI_OUTPUT_REFUSED") {
      return "لم يتمكن الذكاء الاصطناعي من تحليل محتوى هذه الملفات. احذفها وتابع يدوياً أو ارفع ملفات أخرى.";
    }
    if (code === "AI_PROVIDER_USAGE_MISSING") {
      return "اكتمل طلب التحليل من دون بيانات الاستخدام المطلوبة، لذلك لم يحفظ MARKOS النتيجة. احذف الملفات وتابع يدوياً.";
    }
    if (code !== undefined && temporaryFailureCodes.has(code)) {
      return "تعذر على MARKOS تحليل الملفات الآن. ستبقى الملفات متاحة مؤقتاً، لذا يمكنك المحاولة مجدداً أو حذفها والمتابعة يدوياً.";
    }
    return "تعذر على MARKOS تحليل الملفات. حاول مجدداً، أو احذفها وتابع يدوياً.";
  }

  if (code === "AI_PROVIDER_NOT_CONFIGURED" || code === "AI_SERVICE_AUTHENTICATION_FAILED" || code === "AI_SERVICE_UNAUTHORIZED") {
    return "AI document analysis is not connected right now. Enter your products and services manually, or try again after the service is enabled.";
  }
  if (code === "AI_DOCUMENT_UNREADABLE") {
    return "MARKOS could not find readable text in these files. Upload a text-based PDF, DOCX, or TXT file, or continue manually.";
  }
  if (code === "AI_DOCUMENT_INVALID" || code === "AI_DOCUMENT_UNSUPPORTED") {
    return "These files could not be processed safely. Discard them and upload a text-based PDF, DOCX, or TXT file, or continue manually.";
  }
  if (code === "AI_OUTPUT_REFUSED") {
    return "The AI service could not analyze the contents of these files. Discard them and continue manually, or upload different files.";
  }
  if (code === "AI_PROVIDER_USAGE_MISSING") {
    return "The analysis completed without the required usage record, so MARKOS did not save the result. Discard the files and continue manually.";
  }
  if (code !== undefined && temporaryFailureCodes.has(code)) {
    return "MARKOS could not analyze these files right now. Your files remain available temporarily, so you can retry or discard them and continue manually.";
  }
  return "MARKOS could not analyze these files. Retry, or discard them and continue manually.";
}
