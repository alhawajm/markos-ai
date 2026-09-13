import type { AuthSession, Locale, OnboardingState } from "@markos/shared-types";

/** Check server-owned readiness before mounting any normal application page. */
export async function appEntryRedirect(session: AuthSession, client: { onboarding(): Promise<OnboardingState> }, locale: Locale): Promise<string | null> {
  if (!session.user.isVerified) return `/${locale}/verify?email=${encodeURIComponent(session.user.email)}`;
  const state = await client.onboarding();
  if (!state || !["NOT_STARTED", "IN_PROGRESS", "COMPLETE"].includes(state.status) || !state.businessProfile) {
    throw new Error(locale === "ar" ? "تعذر التحقق من حالة الإعداد. حاول مرة أخرى." : "Could not check onboarding status. Please try again.");
  }
  return state.status === "COMPLETE" && state.businessProfile.status === "APPROVED" ? null : `/${locale}/onboarding`;
}
