"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Images,
  Instagram,
  KeyRound,
  Languages,
  Lock,
  Mail,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { MarkosApiClient, MarkosApiError } from "@markos/api-client";
import type { AuthSession, Locale } from "@markos/shared-types";
import { loginSchema, registerSchema } from "@markos/validation";
import { getBrowserApiBaseUrl } from "./api-base-url";
import { refreshBrowserSession, setBrowserSession, useMarkosSession } from "./browser-session";
import { MarkosAiIcon } from "./markos-ai-icon";
import styles from "./auth-page.module.css";

export type AuthPageMode = "signup" | "login" | "forgot-password" | "reset-password" | "verify";

const pendingVerificationEmailKey = "markos.pending-verification-email";

type Notice = {
  tone: "error" | "info" | "success";
  text: string;
};

const pathByMode: Record<AuthPageMode, string> = {
  signup: "signup",
  login: "login",
  "forgot-password": "forgot-password",
  "reset-password": "reset-password",
  verify: "verify"
};

const copyByLocale = {
  en: {
    brand: "MARKOS AI",
    back: "Back to MARKOS",
    language: "العربية",
    aside: {
      title: "Your marketing work, together in one place.",
      items: [
        { icon: "plan", label: "Plan", value: "A clear direction" },
        { icon: "create", label: "Create", value: "Work ready to review" },
        { icon: "publish", label: "Publish", value: "Only with your approval" },
        { icon: "insights", label: "Insights", value: "A clear next step" }
      ]
    },
    provider: {
      google: "Continue with Google",
      apple: "Continue with Apple",
      divider: "or continue with email",
      compactGoogle: "Google",
      compactApple: "Apple",
      compactDivider: "or",
      unavailable: (name: string) => `${name} sign-in is not available yet. Use email for now.`
    },
    fields: {
      fullName: "Full name",
      fullNamePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordRequirement: "At least 12 characters",
      mfaCode: "MFA code",
      mfaPlaceholder: "6-digit code",
      showPassword: "Show password",
      hidePassword: "Hide password",
      showPasswordShort: "Show",
      hidePasswordShort: "Hide"
    },
    legal: {
      prefix: "I agree to the",
      terms: "Terms of Service",
      joiner: "and",
      privacy: "Privacy Policy",
      required: "Agree to the Terms of Service and Privacy Policy to continue."
    },
    signup: {
      title: "Create your account",
      body: "Add your business after your account is ready.",
      action: "Create account",
      switchPrefix: "Already have an account?",
      switchAction: "Log in",
      nameRequired: "Enter your full name.",
      emailRequired: "Enter a valid email address.",
      passwordRequired: "Use a password with at least 12 characters."
    },
    login: {
      eyebrow: "LOG IN",
      title: "Welcome back",
      body: "Continue to your MARKOS workspace.",
      forgot: "Forgot password?",
      action: "Log in",
      switchPrefix: "New to MARKOS?",
      switchAction: "Create an account",
      fieldsRequired: "Enter your email and password.",
      mfaRequired: "Enter the 6-digit code from your authenticator app.",
      preview: {
        ariaLabel: "Interactive sample of the MARKOS content calendar",
        eyebrow: "MARKOS PRODUCT PREVIEW",
        title: "Your week, ready when you are.",
        body: "Pick up your plan at a glance—then create, approve, and schedule.",
        journey: ["Create", "Approve", "Schedule"],
        week: {
          label: "Week of 24 August",
          sample: "SAMPLE PLAN",
          openDay: "Open Wednesday 26 August",
          days: [
            { label: "Mon 24", status: "DRAFT", title: "Behind the scenes", placement: "start" },
            { label: "Tue 25", status: "", title: "", placement: "start" },
            { label: "Wed 26", status: "APPROVAL", title: "Product spotlight", placement: "center" },
            { label: "Thu 27", status: "", title: "", placement: "start" },
            { label: "Fri 28", status: "SCHEDULED", title: "Weekend story", placement: "end" }
          ]
        },
        day: {
          back: "Week overview",
          title: "Wednesday, 26 August",
          count: "3 planned",
          guidance: "Select a post to expand its approval and schedule details.",
          hint: "CLICK A POST TO EXPAND",
          openPost: (title: string) => `Open ${title}`,
          posts: [
            {
              time: "09:30",
              title: "Product spotlight",
              meta: "Instagram feed · Needs approval",
              status: "Needs approval",
              mediaEyebrow: "NEW ARRIVALS",
              mediaTitle: "Made for weekends.",
              caption: "A closer look at a customer favourite—ready for your final review.",
              schedule: "Wed · 09:30"
            },
            {
              time: "13:00",
              title: "Product teaser story",
              meta: "Instagram story · Draft",
              status: "Draft",
              mediaEyebrow: "STORY PREVIEW",
              mediaTitle: "A closer look.",
              caption: "A short teaser that introduces the product before the main post.",
              schedule: "Wed · 13:00"
            },
            {
              time: "18:30",
              title: "Question prompt",
              meta: "Instagram story · Scheduled",
              status: "Scheduled",
              mediaEyebrow: "COMMUNITY",
              mediaTitle: "What would you choose?",
              caption: "Invite followers to share the option they would choose this weekend.",
              schedule: "Wed · 18:30"
            }
          ]
        },
        post: {
          back: "Wednesday",
          format: "Instagram feed · 1 image",
          caption: "CAPTION",
          reserved: "Reserved slot",
          handoff: "Approve to keep this slot",
          action: "Approve & schedule",
          media: "1:1 MEDIA PREVIEW",
          hint: "BACK RETURNS TO THE DAY VIEW"
        }
      }
    },
    forgot: {
      title: "Reset your password",
      body: "Enter the email you use for MARKOS.",
      action: "Send reset link",
      emailRequired: "Enter a valid email address.",
      unavailable: "Password recovery is not connected yet. Please use an existing password for this presentation.",
      sentTitle: "Check your email",
      sentBody: "If an account exists for this address, a password reset link will be sent.",
      sendAgain: "Send again",
      back: "Back to login"
    },
    reset: {
      title: "Choose a new password",
      body: "Use at least 12 characters and enter it twice.",
      action: "Update password",
      mismatch: "The passwords do not match.",
      passwordRequired: "Use a password with at least 12 characters.",
      unavailable: "Password reset is not connected yet. Request support before changing a password.",
      successTitle: "Password updated",
      successBody: "You can now log in with your new password.",
      login: "Continue to login",
      expiredTitle: "This reset link has expired",
      expiredBody: "Request a new link to choose another password.",
      requestNew: "Request a new link"
    },
    verify: {
      title: "Check your email",
      body: "We sent a verification link to",
      fallbackEmail: "your email address",
      instructions: "Open the link to confirm your account. Check your spam folder if it does not arrive.",
      resend: "Resend verification email",
      resendIn: (seconds: number) => `Resend in ${seconds}s`,
      sent: "We sent a verification link to your email.",
      localReady: "A local verification link is ready below.",
      verified: "Your email is verified. Opening onboarding…",
      changeEmail: "Change email",
      back: "Back to login"
    },
    footer: "© 2026 Ra'edat Software L.L.C."
  },
  ar: {
    brand: "MARKOS AI",
    back: "العودة إلى MARKOS",
    language: "English",
    aside: {
      title: "كل أعمالك التسويقية في مكان واحد.",
      items: [
        { icon: "plan", label: "التخطيط", value: "اتجاه واضح" },
        { icon: "create", label: "المحتوى", value: "عمل جاهز للمراجعة" },
        { icon: "publish", label: "النشر", value: "بعد اعتمادك فقط" },
        { icon: "insights", label: "الرؤى", value: "خطوة تالية واضحة" }
      ]
    },
    provider: {
      google: "المتابعة باستخدام Google",
      apple: "المتابعة باستخدام Apple",
      divider: "أو تابع بالبريد الإلكتروني",
      compactGoogle: "Google",
      compactApple: "Apple",
      compactDivider: "أو",
      unavailable: (name: string) => `تسجيل الدخول باستخدام ${name} غير متاح بعد. استخدم البريد الإلكتروني حالياً.`
    },
    fields: {
      fullName: "الاسم الكامل",
      fullNamePlaceholder: "اسمك",
      email: "البريد الإلكتروني",
      emailPlaceholder: "you@example.com",
      password: "كلمة المرور",
      passwordPlaceholder: "أدخل كلمة المرور",
      newPassword: "كلمة المرور الجديدة",
      confirmPassword: "تأكيد كلمة المرور الجديدة",
      passwordRequirement: "12 حرفًا على الأقل",
      mfaCode: "رمز التحقق بخطوتين",
      mfaPlaceholder: "رمز من 6 أرقام",
      showPassword: "إظهار كلمة المرور",
      hidePassword: "إخفاء كلمة المرور",
      showPasswordShort: "إظهار",
      hidePasswordShort: "إخفاء"
    },
    legal: {
      prefix: "أوافق على",
      terms: "شروط الخدمة",
      joiner: "و",
      privacy: "سياسة الخصوصية",
      required: "وافق على شروط الخدمة وسياسة الخصوصية للمتابعة."
    },
    signup: {
      title: "أنشئ حسابك",
      body: "أضف معلومات عملك بعد تجهيز الحساب.",
      action: "إنشاء الحساب",
      switchPrefix: "لديك حساب بالفعل؟",
      switchAction: "تسجيل الدخول",
      nameRequired: "أدخل اسمك الكامل.",
      emailRequired: "أدخل بريدًا إلكترونيًا صالحًا.",
      passwordRequired: "استخدم كلمة مرور من 12 حرفًا على الأقل."
    },
    login: {
      eyebrow: "تسجيل الدخول",
      title: "مرحبًا بعودتك",
      body: "تابع إلى مساحة عمل MARKOS.",
      forgot: "نسيت كلمة المرور؟",
      action: "تسجيل الدخول",
      switchPrefix: "جديد في MARKOS؟",
      switchAction: "إنشاء حساب",
      fieldsRequired: "أدخل بريدك الإلكتروني وكلمة المرور.",
      mfaRequired: "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.",
      preview: {
        ariaLabel: "معاينة تفاعلية لنظام تقويم المحتوى في MARKOS",
        eyebrow: "معاينة منتج MARKOS",
        title: "أسبوعك جاهز عندما تحتاجه.",
        body: "اطّلع على خطتك بسرعة، ثم أنشئ المحتوى واعتمده وجدوله.",
        journey: ["أنشئ", "اعتمد", "جدول"],
        week: {
          label: "أسبوع 24 أغسطس",
          sample: "خطة تجريبية",
          openDay: "فتح يوم الأربعاء 26 أغسطس",
          days: [
            { label: "الاثنين 24", status: "مسودة", title: "خلف الكواليس", placement: "start" },
            { label: "الثلاثاء 25", status: "", title: "", placement: "start" },
            { label: "الأربعاء 26", status: "للاعتماد", title: "إبراز المنتج", placement: "center" },
            { label: "الخميس 27", status: "", title: "", placement: "start" },
            { label: "الجمعة 28", status: "مجدول", title: "قصة نهاية الأسبوع", placement: "end" }
          ]
        },
        day: {
          back: "نظرة الأسبوع",
          title: "الأربعاء، 26 أغسطس",
          count: "3 منشورات",
          guidance: "اختر منشورًا لعرض تفاصيل الاعتماد والجدولة.",
          hint: "اختر منشورًا لعرض التفاصيل",
          openPost: (title: string) => `فتح ${title}`,
          posts: [
            {
              time: "09:30",
              title: "إبراز المنتج",
              meta: "منشور Instagram · يحتاج اعتمادًا",
              status: "يحتاج اعتمادًا",
              mediaEyebrow: "وصل حديثًا",
              mediaTitle: "مصمم لنهاية الأسبوع.",
              caption: "نظرة أقرب على أحد المنتجات المفضلة لدى العملاء، جاهزة لمراجعتك النهائية.",
              schedule: "الأربعاء · 09:30"
            },
            {
              time: "13:00",
              title: "قصة تمهيدية للمنتج",
              meta: "قصة Instagram · مسودة",
              status: "مسودة",
              mediaEyebrow: "معاينة القصة",
              mediaTitle: "نظرة أقرب.",
              caption: "تمهيد قصير يعرّف بالمنتج قبل نشر المنشور الرئيسي.",
              schedule: "الأربعاء · 13:00"
            },
            {
              time: "18:30",
              title: "سؤال للمتابعين",
              meta: "قصة Instagram · مجدولة",
              status: "مجدول",
              mediaEyebrow: "المجتمع",
              mediaTitle: "ماذا ستختار؟",
              caption: "ادعُ المتابعين لمشاركة الخيار الذي يفضلونه في نهاية هذا الأسبوع.",
              schedule: "الأربعاء · 18:30"
            }
          ]
        },
        post: {
          back: "الأربعاء",
          format: "منشور Instagram · صورة واحدة",
          caption: "النص",
          reserved: "موعد محجوز",
          handoff: "اعتمد المحتوى للحفاظ على الموعد",
          action: "اعتماد وجدولة",
          media: "معاينة وسائط 1:1",
          hint: "العودة تفتح عرض اليوم"
        }
      }
    },
    forgot: {
      title: "استعد كلمة المرور",
      body: "أدخل البريد الإلكتروني الذي تستخدمه مع MARKOS.",
      action: "إرسال رابط الاستعادة",
      emailRequired: "أدخل بريدًا إلكترونيًا صالحًا.",
      unavailable: "استعادة كلمة المرور غير متصلة بعد. استخدم كلمة مرور حالية لهذا العرض.",
      sentTitle: "تحقق من بريدك الإلكتروني",
      sentBody: "إذا كان هناك حساب مرتبط بهذا العنوان، فسيتم إرسال رابط استعادة كلمة المرور.",
      sendAgain: "إرسال مرة أخرى",
      back: "العودة إلى تسجيل الدخول"
    },
    reset: {
      title: "اختر كلمة مرور جديدة",
      body: "استخدم 12 حرفًا على الأقل وأدخلها مرتين.",
      action: "تحديث كلمة المرور",
      mismatch: "كلمتا المرور غير متطابقتين.",
      passwordRequired: "استخدم كلمة مرور من 12 حرفًا على الأقل.",
      unavailable: "إعادة تعيين كلمة المرور غير متصلة بعد. تواصل مع الدعم قبل تغيير كلمة المرور.",
      successTitle: "تم تحديث كلمة المرور",
      successBody: "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.",
      login: "المتابعة إلى تسجيل الدخول",
      expiredTitle: "انتهت صلاحية رابط الاستعادة",
      expiredBody: "اطلب رابطًا جديدًا لاختيار كلمة مرور أخرى.",
      requestNew: "طلب رابط جديد"
    },
    verify: {
      title: "تحقق من بريدك الإلكتروني",
      body: "أرسلنا رابط التحقق إلى",
      fallbackEmail: "بريدك الإلكتروني",
      instructions: "افتح الرابط لتأكيد حسابك. تحقق من مجلد الرسائل غير المرغوب فيها إذا لم يصلك.",
      resend: "إعادة إرسال رسالة التحقق",
      resendIn: (seconds: number) => `إعادة الإرسال خلال ${seconds} ث`,
      sent: "أرسلنا رابط تحقق إلى بريدك الإلكتروني.",
      localReady: "رابط التحقق المحلي جاهز أدناه.",
      verified: "تم تأكيد بريدك الإلكتروني. جارٍ فتح الإعداد…",
      changeEmail: "تغيير البريد الإلكتروني",
      back: "العودة إلى تسجيل الدخول"
    },
    footer: "© 2026 Ra'edat Software L.L.C."
  }
} as const;

export function AuthPage({
  initialEmail = "",
  initialToken = "",
  locale,
  mode,
  resetLinkExpired = false
}: {
  initialEmail?: string;
  initialToken?: string;
  locale: Locale;
  mode: AuthPageMode;
  resetLinkExpired?: boolean;
}) {
  const router = useRouter();
  const existingSession = useMarkosSession();
  const client = useMemo(() => new MarkosApiClient({ baseUrl: getBrowserApiBaseUrl() }), []);
  const copy = copyByLocale[locale];
  const isArabic = locale === "ar";
  const currentPath = pathByMode[mode];
  const landingHref = `/${locale}`;
  const loginHref = `/${locale}/login`;
  const signupHref = `/${locale}/signup`;
  const forgotHref = `/${locale}/forgot-password`;
  const termsHref = `/${locale}/terms`;
  const privacyHref = `/${locale}/privacy`;
  const languageQuery =
    mode === "verify" && initialEmail ? `?email=${encodeURIComponent(initialEmail)}` : mode === "reset-password" && resetLinkExpired ? "?expired=1" : "";
  const legalCheckboxRef = useRef<HTMLInputElement>(null);
  const verificationStartedRef = useRef(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [forgotSent, setForgotSent] = useState(false);
  const [fullName, setFullName] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [localVerificationToken, setLocalVerificationToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [password, setPassword] = useState("");
  const [resendSeconds, setResendSeconds] = useState(30);
  const [resetComplete] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (mode !== "login") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "session-expired") {
      setSessionExpired(true);
      setNotice({
        tone: "info",
        text: isArabic ? "انتهت جلستك. سجّل الدخول مرة أخرى للمتابعة إلى ملفك الشخصي." : "Your session expired. Sign in again to continue to your profile."
      });
    } else if (params.get("verified") === "1") {
      setNotice({
        tone: "success",
        text: isArabic ? "تم تأكيد بريدك الإلكتروني. يمكنك تسجيل الدخول الآن." : "Your email is verified. You can log in now."
      });
    }
  }, [isArabic, mode]);

  useEffect(() => {
    if (mode !== "verify" || verificationStartedRef.current) return;

    const pendingEmail = initialEmail || existingSession?.user.email || window.sessionStorage.getItem(pendingVerificationEmailKey) || "";
    if (pendingEmail) setEmail(pendingEmail);
    verificationStartedRef.current = true;

    if (initialToken) {
      window.history.replaceState({}, "", `/${locale}/verify`);
      void verifyEmailToken(initialToken);
      return;
    }

    if (pendingEmail) {
      void requestVerification(pendingEmail);
      return;
    }

    setResendSeconds(0);
    setNotice({ tone: "error", text: isArabic ? "أدخل من صفحة إنشاء الحساب لإرسال رابط التحقق." : "Start from sign up to send a verification link." });
    // The first verification handoff is intentionally processed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "verify" || resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [mode, resendSeconds]);

  function requireLegalAcceptance() {
    if (mode !== "signup" || acceptedTerms) return true;
    setNotice({ tone: "error", text: copy.legal.required });
    legalCheckboxRef.current?.focus();
    return false;
  }

  function handleProvider(provider: "Apple" | "Google") {
    if (!requireLegalAcceptance()) return;
    setNotice({ tone: "info", text: copy.provider.unavailable(provider) });
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (fullName.trim().length < 2) {
      setNotice({ tone: "error", text: copy.signup.nameRequired });
      return;
    }

    if (!isValidEmail(email)) {
      setNotice({ tone: "error", text: copy.signup.emailRequired });
      return;
    }

    if (password.length < 12) {
      setNotice({ tone: "error", text: copy.signup.passwordRequired });
      return;
    }

    if (!requireLegalAcceptance()) return;

    const parsed = registerSchema.safeParse({ email: email.trim(), fullName: fullName.trim(), locale, password });
    if (!parsed.success) {
      setNotice({ tone: "error", text: isArabic ? "تحقق من معلومات الحساب وحاول مرة أخرى." : "Check your account details and try again." });
      return;
    }

    setSubmitting(true);
    try {
      const session = await client.register({
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        locale: parsed.data.locale,
        password: parsed.data.password,
        ...(parsed.data.workspaceName === undefined ? {} : { workspaceName: parsed.data.workspaceName })
      });
      setBrowserSession(session);
      window.sessionStorage.setItem(pendingVerificationEmailKey, session.user.email);
      router.push(`/${locale}/verify?email=${encodeURIComponent(session.user.email)}`);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error, locale) });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!isValidEmail(email) || password.length === 0 || (mfaRequired && !/^\d{6}$/.test(mfaCode))) {
      setNotice({ tone: "error", text: mfaRequired ? copy.login.mfaRequired : copy.login.fieldsRequired });
      return;
    }

    const parsed = loginSchema.safeParse({
      email: email.trim(),
      password,
      ...(mfaCode ? { totpCode: mfaCode } : {})
    });
    if (!parsed.success) {
      setNotice({ tone: "error", text: copy.login.fieldsRequired });
      return;
    }

    setSubmitting(true);
    try {
      const session = await client.login({
        email: parsed.data.email,
        password: parsed.data.password,
        ...(parsed.data.totpCode === undefined ? {} : { totpCode: parsed.data.totpCode })
      });
      setBrowserSession(session);

      if (!session.user.isVerified) {
        window.sessionStorage.setItem(pendingVerificationEmailKey, session.user.email);
        router.push(`/${locale}/verify?email=${encodeURIComponent(session.user.email)}`);
        return;
      }

      router.push(sessionExpired ? `/${locale}/app/settings#profile` : `/${locale}/app`);
    } catch (error) {
      if (error instanceof MarkosApiError && error.code === "MFA_REQUIRED") {
        setMfaRequired(true);
        setNotice({ tone: "info", text: copy.login.mfaRequired });
      } else {
        setNotice({ tone: "error", text: friendlyAuthError(error, locale) });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!isValidEmail(email)) {
      setNotice({ tone: "error", text: copy.forgot.emailRequired });
      return;
    }

    setNotice({ tone: "info", text: copy.forgot.unavailable });
  }

  function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (password.length < 12) {
      setNotice({ tone: "error", text: copy.reset.passwordRequired });
      return;
    }

    if (password !== confirmPassword) {
      setNotice({ tone: "error", text: copy.reset.mismatch });
      return;
    }

    setNotice({ tone: "info", text: copy.reset.unavailable });
  }

  async function requestVerification(requestedEmail = email) {
    const normalizedEmail = requestedEmail.trim();
    if (!isValidEmail(normalizedEmail)) {
      setResendSeconds(0);
      setNotice({ tone: "error", text: copy.signup.emailRequired });
      return;
    }

    setSubmitting(true);
    setLocalVerificationToken(null);
    setNotice(null);
    try {
      const challenge = await client.requestEmailVerification({ email: normalizedEmail, locale });
      window.sessionStorage.setItem(pendingVerificationEmailKey, normalizedEmail);
      setEmail(normalizedEmail);

      if (challenge.alreadyVerified) {
        await finishVerifiedSession();
        return;
      }

      setLocalVerificationToken(challenge.verificationToken ?? null);
      setResendSeconds(30);
      setNotice({ tone: "success", text: challenge.verificationToken ? copy.verify.localReady : copy.verify.sent });
    } catch (error) {
      setResendSeconds(0);
      setNotice({ tone: "error", text: friendlyAuthError(error, locale) });
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyEmailToken(token: string) {
    setSubmitting(true);
    setNotice(null);
    try {
      await client.verifyEmail({ token });
      await finishVerifiedSession();
    } catch (error) {
      setResendSeconds(0);
      setNotice({ tone: "error", text: friendlyAuthError(error, locale) });
    } finally {
      setSubmitting(false);
    }
  }

  async function finishVerifiedSession() {
    window.sessionStorage.removeItem(pendingVerificationEmailKey);
    setNotice({ tone: "success", text: copy.verify.verified });

    try {
      const refreshedSession = await refreshBrowserSession();
      router.replace(nextRouteAfterVerification(refreshedSession, locale));
    } catch {
      router.replace(`/${locale}/login?verified=1`);
    }
  }

  return (
    <main className={`sunlit-theme ${styles.authPage}`} data-auth-page={mode} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.header}>
        <a className={styles.brand} href={landingHref} aria-label={copy.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <MarkosAiIcon size={21} />
          </span>
          <strong>{copy.brand}</strong>
        </a>
        <nav aria-label={isArabic ? "تنقل المصادقة" : "Authentication navigation"}>
          {mode === "login" ? null : (
            <a className={styles.backLink} href={landingHref}>
              <ArrowLeft className={styles.backIcon} aria-hidden="true" size={17} />
              {copy.back}
            </a>
          )}
          <AuthLanguageSelector arabicHref={`/ar/${currentPath}${languageQuery}`} englishHref={`/en/${currentPath}${languageQuery}`} locale={locale} />
        </nav>
      </header>

      <div className={`${styles.authLayout} ${mode === "login" ? styles.loginLayout : mode === "signup" ? styles.signupLayout : ""}`}>
        {mode === "login" ? (
          <>
            <section className={`${styles.authCard} ${styles.loginCard}`} data-login-card>
              <AuthHeading body={copy.login.body} eyebrow={copy.login.eyebrow} title={copy.login.title} />
              <form aria-busy={isSubmitting} className={styles.loginForm} noValidate onSubmit={(event) => void submitLogin(event)}>
                <div className={styles.formStack}>
                  <EmailField copy={copy.fields} email={email} onChange={setEmail} />
                  <PasswordField
                    autoComplete="current-password"
                    copy={copy.fields}
                    onChange={setPassword}
                    password={password}
                    placeholder={copy.fields.passwordPlaceholder}
                    revealVariant="text"
                    show={showPassword}
                    toggle={() => setShowPassword((current) => !current)}
                  />
                  {mfaRequired ? (
                    <Field id="mfa-code" label={copy.fields.mfaCode}>
                      <span className={styles.inputWrap}>
                        <ShieldCheck aria-hidden="true" size={19} />
                        <input
                          autoComplete="one-time-code"
                          id="mfa-code"
                          inputMode="numeric"
                          maxLength={6}
                          onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder={copy.fields.mfaPlaceholder}
                          value={mfaCode}
                        />
                      </span>
                    </Field>
                  ) : null}
                </div>
                <div className={styles.forgotRow}>
                  <a className={styles.inlineAction} href={forgotHref}>
                    {copy.login.forgot}
                  </a>
                </div>
                <NoticeMessage notice={notice} />
                <button className={styles.primaryButton} disabled={isSubmitting} type="submit">
                  {isSubmitting ? (isArabic ? "جارٍ تسجيل الدخول…" : "Logging in…") : copy.login.action}
                </button>
              </form>
              <Divider label={copy.provider.compactDivider} />
              <ProviderButtons compact copy={copy.provider} onProvider={handleProvider} />
              <AuthSwitch action={copy.login.switchAction} href={signupHref} prefix={copy.login.switchPrefix} />
            </section>
            <LoginInsightsPreview locale={locale} />
          </>
        ) : (
          <>
            <section className={`${styles.authCard} ${mode === "signup" ? styles.signupCard : ""}`}>
              {mode === "signup" ? (
                <>
                  <AuthHeading body={copy.signup.body} title={copy.signup.title} />
                  <ProviderButtons copy={copy.provider} onProvider={handleProvider} />
                  <Divider label={copy.provider.divider} />
                  <form aria-busy={isSubmitting} noValidate onSubmit={(event) => void submitSignup(event)}>
                    <div className={styles.formStack}>
                      <Field id="full-name" label={copy.fields.fullName}>
                        <input
                          autoComplete="name"
                          id="full-name"
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder={copy.fields.fullNamePlaceholder}
                          type="text"
                          value={fullName}
                        />
                      </Field>
                      <EmailField copy={copy.fields} email={email} onChange={setEmail} />
                      <PasswordField
                        copy={copy.fields}
                        onChange={setPassword}
                        password={password}
                        requirement
                        show={showPassword}
                        toggle={() => setShowPassword((current) => !current)}
                      />
                    </div>
                    <LegalConsent
                      accepted={acceptedTerms}
                      checkboxRef={legalCheckboxRef}
                      copy={copy.legal}
                      onChange={setAcceptedTerms}
                      privacyHref={privacyHref}
                      termsHref={termsHref}
                    />
                    <NoticeMessage notice={notice} />
                    <button className={styles.primaryButton} disabled={isSubmitting} type="submit">
                      {isSubmitting ? (isArabic ? "جارٍ إنشاء الحساب…" : "Creating account…") : copy.signup.action}
                      <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                    </button>
                  </form>
                  <AuthSwitch action={copy.signup.switchAction} href={loginHref} prefix={copy.signup.switchPrefix} />
                </>
              ) : null}

              {mode === "forgot-password" ? (
                forgotSent ? (
                  <StatusPanel icon={Mail} title={copy.forgot.sentTitle} tone="aqua">
                    <p>{copy.forgot.sentBody}</p>
                    <strong className={styles.statusEmail} dir="ltr">
                      {email}
                    </strong>
                    <button className={styles.secondaryButton} onClick={() => setForgotSent(false)} type="button">
                      {copy.forgot.sendAgain}
                    </button>
                    <a className={styles.textLink} href={loginHref}>
                      {copy.forgot.back}
                    </a>
                  </StatusPanel>
                ) : (
                  <>
                    <AuthHeading body={copy.forgot.body} icon={KeyRound} title={copy.forgot.title} />
                    <form noValidate onSubmit={submitForgot}>
                      <div className={styles.formStack}>
                        <EmailField copy={copy.fields} email={email} onChange={setEmail} />
                      </div>
                      <NoticeMessage notice={notice} />
                      <button className={styles.primaryButton} type="submit">
                        {copy.forgot.action}
                        <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                      </button>
                    </form>
                    <a className={`${styles.textLink} ${styles.centeredLink}`} href={loginHref}>
                      {copy.forgot.back}
                    </a>
                  </>
                )
              ) : null}

              {mode === "reset-password" ? (
                resetLinkExpired ? (
                  <StatusPanel icon={Lock} title={copy.reset.expiredTitle} tone="coral">
                    <p>{copy.reset.expiredBody}</p>
                    <a className={styles.primaryButton} href={forgotHref}>
                      {copy.reset.requestNew}
                      <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                    </a>
                  </StatusPanel>
                ) : resetComplete ? (
                  <StatusPanel icon={CheckCircle2} title={copy.reset.successTitle} tone="aqua">
                    <p>{copy.reset.successBody}</p>
                    <a className={styles.primaryButton} href={loginHref}>
                      {copy.reset.login}
                      <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                    </a>
                  </StatusPanel>
                ) : (
                  <>
                    <AuthHeading body={copy.reset.body} icon={Lock} title={copy.reset.title} />
                    <form noValidate onSubmit={submitReset}>
                      <div className={styles.formStack}>
                        <PasswordField
                          copy={copy.fields}
                          id="new-password"
                          label={copy.fields.newPassword}
                          onChange={setPassword}
                          password={password}
                          requirement
                          show={showPassword}
                          toggle={() => setShowPassword((current) => !current)}
                        />
                        <PasswordField
                          copy={copy.fields}
                          id="confirm-password"
                          label={copy.fields.confirmPassword}
                          onChange={setConfirmPassword}
                          password={confirmPassword}
                          show={showConfirmPassword}
                          toggle={() => setShowConfirmPassword((current) => !current)}
                        />
                      </div>
                      <NoticeMessage notice={notice} />
                      <button className={styles.primaryButton} type="submit">
                        {copy.reset.action}
                        <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                      </button>
                    </form>
                  </>
                )
              ) : null}

              {mode === "verify" ? (
                <StatusPanel icon={ShieldCheck} title={copy.verify.title} tone="aqua">
                  <p>{copy.verify.body}</p>
                  <strong className={styles.statusEmail} dir="ltr">
                    {email || copy.verify.fallbackEmail}
                  </strong>
                  <p>{copy.verify.instructions}</p>
                  <NoticeMessage notice={notice} />
                  <button
                    className={styles.secondaryButton}
                    disabled={isSubmitting || resendSeconds > 0 || !email}
                    onClick={() => void requestVerification()}
                    type="button"
                  >
                    <Mail aria-hidden="true" size={17} />
                    {resendSeconds > 0 ? copy.verify.resendIn(resendSeconds) : copy.verify.resend}
                  </button>
                  {localVerificationToken ? (
                    <button
                      className={styles.primaryButton}
                      disabled={isSubmitting}
                      onClick={() => void verifyEmailToken(localVerificationToken)}
                      type="button"
                    >
                      {isArabic ? "تأكيد محلي والمتابعة" : "Verify locally and continue"}
                      <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                    </button>
                  ) : null}
                  <div className={styles.statusLinks}>
                    <a className={styles.textLink} href={signupHref}>
                      {copy.verify.changeEmail}
                    </a>
                    <a className={styles.textLink} href={loginHref}>
                      {copy.verify.back}
                    </a>
                  </div>
                </StatusPanel>
              ) : null}
            </section>
            {mode === "signup" ? <SignupCalendarPreview locale={locale} /> : null}
          </>
        )}
      </div>

      <footer className={styles.footer}>
        <span>{copy.footer}</span>
        <span>
          <a href={termsHref}>{copy.legal.terms}</a>
          <i aria-hidden="true">·</i>
          <a href={privacyHref}>{copy.legal.privacy}</a>
        </span>
      </footer>
    </main>
  );
}

function SignupCalendarPreview({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar";
  const days = isArabic ? ["الأحد 6", "الاثنين 7", "الثلاثاء 8", "الأربعاء 9", "الخميس 10"] : ["Sun 6", "Mon 7", "Tue 8", "Wed 9", "Thu 10"];
  const posts = isArabic
    ? [
        { day: 0, icon: Play, time: "10:00", title: "جولة سريعة في المطبخ", tone: "coral", type: "ريل" },
        { day: 1, icon: Images, time: "13:30", title: "ثلاث نصائح لاختيار الوجبة", tone: "aqua", type: "كاروسيل" },
        { day: 2, icon: Instagram, time: "09:00", title: "قصة عميلة هذا الأسبوع", tone: "pink", type: "منشور" },
        { day: 3, icon: Play, time: "18:00", title: "من الفكرة إلى المنتج", tone: "yellow", type: "ريل" },
        { day: 4, icon: Instagram, time: "11:30", title: "اختيار الجمهور", tone: "aqua", type: "قصة" }
      ]
    : [
        { day: 0, icon: Play, time: "10:00", title: "A quick kitchen tour", tone: "coral", type: "Reel" },
        { day: 1, icon: Images, time: "13:30", title: "3 ways to choose your plan", tone: "aqua", type: "Carousel" },
        { day: 2, icon: Instagram, time: "09:00", title: "This week's customer story", tone: "pink", type: "Post" },
        { day: 3, icon: Play, time: "18:00", title: "From idea to finished product", tone: "yellow", type: "Reel" },
        { day: 4, icon: Instagram, time: "11:30", title: "Audience choice", tone: "aqua", type: "Story" }
      ];

  return (
    <aside
      aria-label={isArabic ? "معاينة ثابتة لتقويم MARKOS" : "Static preview of a populated MARKOS calendar"}
      className={`${styles.authPreview} ${styles.signupPreview}`}
    >
      <div className={styles.authPreviewHeader}>
        <span className={styles.authPreviewIcon} aria-hidden="true">
          <CalendarDays size={22} />
        </span>
        <div>
          <p>{isArabic ? "تقويم MARKOS" : "MARKOS CALENDAR"}</p>
          <h2>{isArabic ? "خطتك جاهزة للأسبوع" : "Your week, already taking shape"}</h2>
        </div>
        <span className={styles.sampleBadge}>{isArabic ? "نموذج" : "SAMPLE"}</span>
      </div>
      <div className={styles.calendarPreviewToolbar}>
        <strong>{isArabic ? "6–10 سبتمبر" : "6–10 September"}</strong>
        <span>{isArabic ? "عرض الأسبوع" : "Week view"}</span>
      </div>
      <div className={styles.staticWeekGrid} aria-hidden="true">
        {days.map((day, index) => (
          <div className={styles.staticWeekDay} key={day}>
            <span>{day}</span>
            <div className={styles.staticWeekTrack}>
              {posts
                .filter((post) => post.day === index)
                .map((post) => {
                  const Icon = post.icon;
                  return (
                    <article data-tone={post.tone} key={post.title}>
                      <span>
                        <Icon size={14} /> {post.type}
                      </span>
                      <strong>{post.title}</strong>
                      <small>{post.time}</small>
                    </article>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.calendarPreviewFooter}>
        <span>{isArabic ? "5 قطع محتوى" : "5 content ideas"}</span>
        <strong>{isArabic ? "3 جاهزة للمراجعة" : "3 ready to review"}</strong>
      </div>
    </aside>
  );
}

function LoginInsightsPreview({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar";
  return (
    <aside
      aria-label={isArabic ? "معاينة ثابتة للوحة رؤى MARKOS" : "Static preview of a populated MARKOS Insights dashboard"}
      className={`${styles.authPreview} ${styles.insightsPreview}`}
    >
      <div className={styles.authPreviewHeader}>
        <span className={styles.authPreviewIcon} aria-hidden="true">
          <BarChart3 size={22} />
        </span>
        <div>
          <p>{isArabic ? "رؤى MARKOS" : "MARKOS INSIGHTS"}</p>
          <h2>{isArabic ? "اعرف ما الذي يحرّك النمو" : "See what is moving the business"}</h2>
        </div>
        <span className={styles.sampleBadge}>{isArabic ? "آخر 30 يومًا" : "LAST 30 DAYS"}</span>
      </div>
      <div className={styles.insightMetricGrid}>
        <article>
          <TrendingUp aria-hidden="true" size={18} />
          <span>{isArabic ? "الوصول" : "Reach"}</span>
          <strong>38.4K</strong>
          <small>+18.6%</small>
        </article>
        <article>
          <UsersRound aria-hidden="true" size={18} />
          <span>{isArabic ? "تفاعل الجمهور" : "Engagement"}</span>
          <strong>7.8%</strong>
          <small>+2.1%</small>
        </article>
        <article>
          <CalendarDays aria-hidden="true" size={18} />
          <span>{isArabic ? "محتوى منشور" : "Published"}</span>
          <strong>16</strong>
          <small>{isArabic ? "هذا الشهر" : "this month"}</small>
        </article>
      </div>
      <div className={styles.insightCharts}>
        <article className={styles.reachChart}>
          <header>
            <span>{isArabic ? "الوصول بمرور الوقت" : "Reach over time"}</span>
            <strong>+18.6%</strong>
          </header>
          <svg aria-label={isArabic ? "مخطط وصول صاعد" : "Rising reach chart"} role="img" viewBox="0 0 420 190">
            <defs>
              <linearGradient id="auth-reach-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#21bfae" stopOpacity=".34" />
                <stop offset="100%" stopColor="#21bfae" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 154 C50 142 76 160 116 124 S174 128 210 92 S280 108 318 61 S380 70 420 24 L420 190 L0 190 Z" fill="url(#auth-reach-fill)" />
            <path
              d="M0 154 C50 142 76 160 116 124 S174 128 210 92 S280 108 318 61 S380 70 420 24"
              fill="none"
              stroke="#078c7d"
              strokeLinecap="round"
              strokeWidth="5"
            />
          </svg>
          <div>
            <span>6 Aug</span>
            <span>20 Aug</span>
            <span>2 Sep</span>
          </div>
        </article>
        <article className={styles.contentMixChart}>
          <header>
            <span>{isArabic ? "مزيج المحتوى" : "Content mix"}</span>
          </header>
          <div className={styles.donutChart} aria-label={isArabic ? "ريل 45%، كاروسيل 35%، منشورات 20%" : "Reels 45%, carousels 35%, posts 20%"} role="img">
            <span>
              16<small>{isArabic ? "منشورًا" : "posts"}</small>
            </span>
          </div>
          <ul>
            <li data-tone="coral">
              {isArabic ? "ريل" : "Reels"} <strong>45%</strong>
            </li>
            <li data-tone="aqua">
              {isArabic ? "كاروسيل" : "Carousels"} <strong>35%</strong>
            </li>
            <li data-tone="yellow">
              {isArabic ? "منشورات" : "Posts"} <strong>20%</strong>
            </li>
          </ul>
        </article>
      </div>
      <div className={styles.insightCallout}>
        <Sparkles aria-hidden="true" size={18} />
        <span>{isArabic ? "مقاطع الريل التعليمية تحقق أفضل وصول هذا الشهر." : "Educational Reels are delivering your strongest reach this month."}</span>
      </div>
    </aside>
  );
}

function AuthLanguageSelector({ arabicHref, englishHref, locale }: { arabicHref: string; englishHref: string; locale: Locale }) {
  return (
    <span aria-label={locale === "ar" ? "اختر اللغة" : "Choose language"} className={styles.authLanguageSelector} dir="ltr" role="group">
      <Languages aria-hidden="true" size={16} />
      {locale === "en" ? <strong aria-current="page">English</strong> : <Link href={englishHref}>English</Link>}
      <span aria-hidden="true">/</span>
      {locale === "ar" ? (
        <strong aria-current="page" lang="ar">
          العربية
        </strong>
      ) : (
        <Link href={arabicHref} lang="ar">
          العربية
        </Link>
      )}
    </span>
  );
}

function AuthHeading({ body, eyebrow, icon: Icon, title }: { body: string; eyebrow?: string; icon?: LucideIcon; title: string }) {
  return (
    <div className={styles.authHeading}>
      {Icon ? (
        <span aria-hidden="true">
          <Icon size={22} />
        </span>
      ) : null}
      {eyebrow ? <p className={styles.authEyebrow}>{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}

function ProviderButtons({
  compact = false,
  copy,
  onProvider
}: {
  compact?: boolean;
  copy: (typeof copyByLocale)[Locale]["provider"];
  onProvider: (provider: "Apple" | "Google") => void;
}) {
  return (
    <div className={`${styles.providerStack} ${compact ? styles.providerCompact : ""}`}>
      <button className={styles.providerButton} onClick={() => onProvider("Google")} type="button">
        <Image alt="" aria-hidden="true" className={styles.googleLogo} height={32} src="/auth/providers/google-signin.svg" unoptimized width={32} />
        {compact ? copy.compactGoogle : copy.google}
      </button>
      <button className={styles.providerButton} onClick={() => onProvider("Apple")} type="button">
        <span className={styles.appleLogoFrame} aria-hidden="true">
          <Image alt="" className={styles.appleLogo} height={23} src="/auth/providers/apple-signin.png" unoptimized width={18} />
        </span>
        {compact ? copy.compactApple : copy.apple}
      </button>
    </div>
  );
}

function LegalConsent({
  accepted,
  checkboxRef,
  copy,
  onChange,
  privacyHref,
  termsHref
}: {
  accepted: boolean;
  checkboxRef: RefObject<HTMLInputElement | null>;
  copy: (typeof copyByLocale)[Locale]["legal"];
  onChange: (accepted: boolean) => void;
  privacyHref: string;
  termsHref: string;
}) {
  return (
    <div className={styles.legalConsent}>
      <input checked={accepted} id="legal-consent" onChange={(event) => onChange(event.target.checked)} ref={checkboxRef} type="checkbox" />
      <label htmlFor="legal-consent">
        {copy.prefix}{" "}
        <a href={termsHref} rel="noreferrer" target="_blank">
          {copy.terms}
        </a>{" "}
        {copy.joiner}{" "}
        <a href={privacyHref} rel="noreferrer" target="_blank">
          {copy.privacy}
        </a>
        .
      </label>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className={styles.divider}>
      <span />
      <small>{label}</small>
      <span />
    </div>
  );
}

function Field({ action, children, id, label }: { action?: ReactNode; children: ReactNode; id: string; label: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        <label htmlFor={id}>{label}</label>
        {action}
      </span>
      {children}
    </div>
  );
}

function EmailField({ copy, email, onChange }: { copy: (typeof copyByLocale)[Locale]["fields"]; email: string; onChange: (email: string) => void }) {
  return (
    <Field id="email" label={copy.email}>
      <span className={styles.inputWrap}>
        <Mail aria-hidden="true" size={19} />
        <input
          autoComplete="email"
          id="email"
          inputMode="email"
          onChange={(event) => onChange(event.target.value)}
          placeholder={copy.emailPlaceholder}
          type="email"
          value={email}
        />
      </span>
    </Field>
  );
}

function PasswordField({
  action,
  autoComplete = "new-password",
  copy,
  id = "password",
  label,
  onChange,
  password,
  placeholder,
  revealVariant = "icon",
  requirement = false,
  show,
  toggle
}: {
  action?: { href: string; label: string };
  autoComplete?: "current-password" | "new-password";
  copy: (typeof copyByLocale)[Locale]["fields"];
  id?: string;
  label?: string;
  onChange: (password: string) => void;
  password: string;
  placeholder?: string;
  revealVariant?: "icon" | "text";
  requirement?: boolean;
  show: boolean;
  toggle: () => void;
}) {
  return (
    <Field
      action={
        action ? (
          <a className={styles.inlineAction} href={action.href}>
            {action.label}
          </a>
        ) : undefined
      }
      id={id}
      label={label ?? copy.password}
    >
      <span className={styles.inputWrap}>
        <Lock aria-hidden="true" size={19} />
        <input
          autoComplete={autoComplete}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={show ? "text" : "password"}
          value={password}
        />
        <button
          aria-label={show ? copy.hidePassword : copy.showPassword}
          className={styles.revealButton}
          data-variant={revealVariant}
          onClick={toggle}
          type="button"
        >
          {revealVariant === "text" ? (
            show ? (
              copy.hidePasswordShort
            ) : (
              copy.showPasswordShort
            )
          ) : show ? (
            <EyeOff aria-hidden="true" size={19} />
          ) : (
            <Eye aria-hidden="true" size={19} />
          )}
        </button>
      </span>
      {requirement ? (
        <small className={styles.passwordRequirement} data-met={password.length >= 12 ? "true" : "false"}>
          <span aria-hidden="true">
            <Check size={13} />
          </span>
          {copy.passwordRequirement}
        </small>
      ) : null}
    </Field>
  );
}

function NoticeMessage({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p className={styles.notice} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  );
}

function AuthSwitch({ action, href, prefix }: { action: string; href: string; prefix: string }) {
  return (
    <p className={styles.authSwitch}>
      {prefix} <a href={href}>{action}</a>
    </p>
  );
}

function StatusPanel({ children, icon: Icon, title, tone }: { children: ReactNode; icon: LucideIcon; title: string; tone: "aqua" | "coral" }) {
  return (
    <div className={styles.statusPanel}>
      <span className={styles.statusIcon} data-tone={tone} aria-hidden="true">
        <Icon size={29} />
      </span>
      <h1>{title}</h1>
      <div className={styles.statusContent}>{children}</div>
    </div>
  );
}

function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

function nextRouteAfterVerification(session: AuthSession, locale: Locale) {
  return session.user.isVerified ? `/${locale}/onboarding` : `/${locale}/verify`;
}

function friendlyAuthError(error: unknown, locale: Locale) {
  const isArabic = locale === "ar";

  if (!(error instanceof MarkosApiError)) {
    return isArabic ? "تعذر إكمال الطلب. تحقق من الاتصال وحاول مرة أخرى." : "Could not complete the request. Check your connection and try again.";
  }

  switch (error.code) {
    case "EMAIL_ALREADY_EXISTS":
      return isArabic ? "هذا البريد مستخدم بالفعل. جرّب تسجيل الدخول." : "This email already has an account. Try logging in.";
    case "INVALID_CREDENTIALS":
      return isArabic ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "Email or password is incorrect.";
    case "MFA_INVALID":
      return isArabic ? "رمز التحقق غير صحيح. جرّب رمزاً جديداً." : "That MFA code is invalid. Try a new code.";
    case "MFA_REQUIRED":
      return isArabic ? "أدخل رمز التحقق المكوّن من 6 أرقام." : "Enter the 6-digit MFA code.";
    case "EMAIL_VERIFICATION_INVALID":
      return isArabic ? "رابط التحقق غير صالح أو منتهي. اطلب رابطاً جديداً." : "The verification link is invalid or expired. Request a new one.";
    case "EMAIL_DELIVERY_UNAVAILABLE":
    case "EMAIL_DELIVERY_NOT_CONFIGURED":
      return isArabic ? "تعذر إرسال رابط التحقق الآن. حاول مرة أخرى بعد قليل." : "We could not send the verification link. Try again shortly.";
    default:
      return error.message;
  }
}
