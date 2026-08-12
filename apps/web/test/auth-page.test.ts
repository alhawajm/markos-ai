import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const authPath = fileURLToPath(new URL("../app/[locale]/_components/auth-page.tsx", import.meta.url));
const authStylesPath = fileURLToPath(new URL("../app/[locale]/_components/auth-page.module.css", import.meta.url));
const sunlitThemePath = fileURLToPath(new URL("../app/sunlit-theme.css", import.meta.url));
const legalPath = fileURLToPath(new URL("../app/[locale]/_components/legal-document.tsx", import.meta.url));
const termsPagePath = fileURLToPath(new URL("../app/[locale]/terms/page.tsx", import.meta.url));
const privacyPagePath = fileURLToPath(new URL("../app/[locale]/privacy/page.tsx", import.meta.url));

const authSource = readFileSync(authPath, "utf8");
const authStyles = readFileSync(authStylesPath, "utf8");
const sunlitTheme = readFileSync(sunlitThemePath, "utf8");
const legalSource = readFileSync(legalPath, "utf8");
const termsPageSource = readFileSync(termsPagePath, "utf8");
const privacyPageSource = readFileSync(privacyPagePath, "utf8");

describe("Sunlit authentication pages", () => {
  it("connects email authentication while keeping deferred provider controls honest", () => {
    expect(authSource).toContain("Continue with Google");
    expect(authSource).toContain("Continue with Apple");
    expect(authSource).toContain("/auth/providers/google-signin.svg");
    expect(authSource).toContain("/auth/providers/apple-signin.png");
    expect(authSource).toContain("sign-in is not available yet");
    expect(authSource).toContain("@markos/api-client");
    expect(authSource).toContain("client.register");
    expect(authSource).toContain("client.login");
    expect(authSource).toContain("client.requestEmailVerification");
    expect(authSource).toContain("client.verifyEmail");
    expect(authSource).not.toContain("fetch(");
    expect(authSource).not.toContain("googleTokenExchange");
  });

  it("covers account creation, recovery, verification, and explicit legal consent", () => {
    expect(authSource).toContain('type AuthPageMode = "signup" | "login" | "forgot-password" | "reset-password" | "verify"');
    expect(authSource).toContain("At least 12 characters");
    expect(authSource).toContain("Terms of Service");
    expect(authSource).toContain("Privacy Policy");
    expect(authSource).toContain("If an account exists for this address");
    expect(authSource).toContain("Check your spam folder");
    expect(authSource).toContain("Resend verification email");
    expect(authSource).toContain('autoComplete="current-password"');
  });

  it("provides readable English and Arabic layouts with RTL-safe controls", () => {
    expect(authSource).toContain('dir={isArabic ? "rtl" : "ltr"}');
    expect(authSource).toContain("أنشئ حسابك");
    expect(authSource).toContain("استعد كلمة المرور");
    expect(authSource).toContain("إعادة إرسال رسالة التحقق");
    expect(authStyles).toContain('[dir="rtl"] .directionalIcon');
    expect(authStyles).toContain("transform: scaleX(-1)");
    expect(authStyles).toContain("color: var(--ink-soft)");
  });

  it("keeps browser autofill and text selection within the bright field theme", () => {
    expect(authSource).toContain("sunlit-theme");
    expect(sunlitTheme).toContain("color-scheme: light");
    expect(authStyles).toContain("input:-webkit-autofill");
    expect(authStyles).toContain("-webkit-text-fill-color: var(--ink)");
    expect(authStyles).toContain("input::selection");
    expect(authStyles).toContain("input::-ms-reveal");
  });
});

describe("draft legal pages", () => {
  it("marks both documents as unapproved drafts and attributes the operator", () => {
    expect(legalSource).toContain("Working draft");
    expect(legalSource).toContain("Final wording requires legal review before launch");
    expect(legalSource).toContain("Ra'edat Software L.L.C.");
    expect(legalSource).toContain("مسودة عمل");
    expect(legalSource).toContain("مراجعة قانونية قبل الإطلاق");
  });

  it("keeps both draft documents out of search indexes", () => {
    for (const pageSource of [termsPageSource, privacyPageSource]) {
      expect(pageSource).toContain("follow: false");
      expect(pageSource).toContain("index: false");
    }
  });
});
