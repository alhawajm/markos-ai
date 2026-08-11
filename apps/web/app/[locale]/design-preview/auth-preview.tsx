"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import Image from "next/image";
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
  Globe2,
  KeyRound,
  Lock,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  type LucideIcon
} from "lucide-react";
import type { Locale } from "@markos/shared-types";
import styles from "./auth-preview.module.css";

export type AuthPreviewMode = "signup" | "login" | "forgot-password" | "reset-password" | "verify";

type Notice = {
  tone: "error" | "info" | "success";
  text: string;
};

const pathByMode: Record<AuthPreviewMode, string> = {
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
      mock: (name: string) => `${name} sign-in will open here in the final system.`
    },
    fields: {
      fullName: "Full name",
      fullNamePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordRequirement: "At least 12 characters",
      showPassword: "Show password",
      hidePassword: "Hide password"
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
      title: "Welcome back",
      body: "Continue to your MARKOS workspace.",
      forgot: "Forgot password?",
      action: "Log in",
      switchPrefix: "New to MARKOS?",
      switchAction: "Create an account",
      fieldsRequired: "Enter your email and password.",
      mockSuccess: "The login UI is ready. Live authentication remains unchanged outside this preview."
    },
    forgot: {
      title: "Reset your password",
      body: "Enter the email you use for MARKOS.",
      action: "Send reset link",
      emailRequired: "Enter a valid email address.",
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
      resent: "A new verification email would be sent now.",
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
      mock: (name: string) => `سيتم فتح تسجيل الدخول باستخدام ${name} هنا في النظام النهائي.`
    },
    fields: {
      fullName: "الاسم الكامل",
      fullNamePlaceholder: "اسمك",
      email: "البريد الإلكتروني",
      emailPlaceholder: "you@example.com",
      password: "كلمة المرور",
      newPassword: "كلمة المرور الجديدة",
      confirmPassword: "تأكيد كلمة المرور الجديدة",
      passwordRequirement: "12 حرفًا على الأقل",
      showPassword: "إظهار كلمة المرور",
      hidePassword: "إخفاء كلمة المرور"
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
      title: "مرحبًا بعودتك",
      body: "تابع إلى مساحة عمل MARKOS.",
      forgot: "نسيت كلمة المرور؟",
      action: "تسجيل الدخول",
      switchPrefix: "جديد في MARKOS؟",
      switchAction: "إنشاء حساب",
      fieldsRequired: "أدخل بريدك الإلكتروني وكلمة المرور.",
      mockSuccess: "واجهة تسجيل الدخول جاهزة. لم تتغير المصادقة الفعلية خارج هذه المعاينة."
    },
    forgot: {
      title: "استعد كلمة المرور",
      body: "أدخل البريد الإلكتروني الذي تستخدمه مع MARKOS.",
      action: "إرسال رابط الاستعادة",
      emailRequired: "أدخل بريدًا إلكترونيًا صالحًا.",
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
      resent: "سيتم الآن إرسال رسالة تحقق جديدة.",
      changeEmail: "تغيير البريد الإلكتروني",
      back: "العودة إلى تسجيل الدخول"
    },
    footer: "© 2026 Ra'edat Software L.L.C."
  }
} as const;

const asideIcons = {
  plan: CalendarDays,
  create: Wand2,
  publish: Send,
  insights: BarChart3
} as const;

export function AuthPreview({
  initialEmail = "",
  locale,
  mode,
  resetLinkExpired = false
}: {
  initialEmail?: string;
  locale: Locale;
  mode: AuthPreviewMode;
  resetLinkExpired?: boolean;
}) {
  const router = useRouter();
  const copy = copyByLocale[locale];
  const isArabic = locale === "ar";
  const otherLocale = isArabic ? "en" : "ar";
  const currentPath = pathByMode[mode];
  const landingHref = `/${locale}/design-preview`;
  const loginHref = `/${locale}/design-preview/login`;
  const signupHref = `/${locale}/design-preview/signup`;
  const forgotHref = `/${locale}/design-preview/forgot-password`;
  const termsHref = `/${locale}/design-preview/terms`;
  const privacyHref = `/${locale}/design-preview/privacy`;
  const languageQuery =
    mode === "verify" && initialEmail ? `?email=${encodeURIComponent(initialEmail)}` : mode === "reset-password" && resetLinkExpired ? "?expired=1" : "";
  const languageHref = `/${otherLocale}/design-preview/${currentPath}${languageQuery}`;
  const legalCheckboxRef = useRef<HTMLInputElement>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [forgotSent, setForgotSent] = useState(false);
  const [fullName, setFullName] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [password, setPassword] = useState("");
  const [resendSeconds, setResendSeconds] = useState(30);
  const [resetComplete, setResetComplete] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    setNotice({ tone: "info", text: copy.provider.mock(provider) });
  }

  function submitSignup(event: FormEvent<HTMLFormElement>) {
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
    router.push(`/${locale}/design-preview/verify?email=${encodeURIComponent(email.trim())}`);
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!isValidEmail(email) || password.length === 0) {
      setNotice({ tone: "error", text: copy.login.fieldsRequired });
      return;
    }

    setNotice({ tone: "success", text: copy.login.mockSuccess });
  }

  function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!isValidEmail(email)) {
      setNotice({ tone: "error", text: copy.forgot.emailRequired });
      return;
    }

    setForgotSent(true);
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

    setResetComplete(true);
  }

  return (
    <main className={styles.authPage} data-auth-preview={mode} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.header}>
        <a className={styles.brand} href={landingHref} aria-label={copy.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Sparkles size={21} />
          </span>
          <strong>{copy.brand}</strong>
        </a>
        <nav aria-label={isArabic ? "تنقل المصادقة" : "Authentication navigation"}>
          <a className={styles.backLink} href={landingHref}>
            <ArrowLeft className={styles.backIcon} aria-hidden="true" size={17} />
            {copy.back}
          </a>
          <a className={styles.languageLink} href={languageHref}>
            <Globe2 aria-hidden="true" size={17} />
            {copy.language}
          </a>
        </nav>
      </header>

      <div className={styles.authLayout}>
        <aside className={styles.authAside} aria-label={copy.aside.title}>
          <div className={styles.asideGlow} aria-hidden="true" />
          <p className={styles.asideBrand}>{copy.brand}</p>
          <h2>{copy.aside.title}</h2>
          <div className={styles.asideFlow}>
            {copy.aside.items.map((item, index) => {
              const Icon = asideIcons[item.icon];
              return (
                <div className={styles.asideItem} data-position={index} key={item.label}>
                  <span aria-hidden="true">
                    <Icon size={19} />
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.value}</small>
                  </div>
                  <Check aria-hidden="true" size={17} />
                </div>
              );
            })}
          </div>
        </aside>

        <section className={styles.authCard}>
          {mode === "signup" ? (
            <>
              <AuthHeading body={copy.signup.body} title={copy.signup.title} />
              <ProviderButtons copy={copy.provider} onProvider={handleProvider} />
              <LegalConsent
                accepted={acceptedTerms}
                checkboxRef={legalCheckboxRef}
                copy={copy.legal}
                onChange={setAcceptedTerms}
                privacyHref={privacyHref}
                termsHref={termsHref}
              />
              <Divider label={copy.provider.divider} />
              <form noValidate onSubmit={submitSignup}>
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
                <NoticeMessage notice={notice} />
                <button className={styles.primaryButton} type="submit">
                  {copy.signup.action}
                  <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                </button>
              </form>
              <AuthSwitch action={copy.signup.switchAction} href={loginHref} prefix={copy.signup.switchPrefix} />
            </>
          ) : null}

          {mode === "login" ? (
            <>
              <AuthHeading body={copy.login.body} title={copy.login.title} />
              <ProviderButtons copy={copy.provider} onProvider={handleProvider} />
              <Divider label={copy.provider.divider} />
              <form noValidate onSubmit={submitLogin}>
                <div className={styles.formStack}>
                  <EmailField copy={copy.fields} email={email} onChange={setEmail} />
                  <PasswordField
                    action={{ href: forgotHref, label: copy.login.forgot }}
                    autoComplete="current-password"
                    copy={copy.fields}
                    onChange={setPassword}
                    password={password}
                    show={showPassword}
                    toggle={() => setShowPassword((current) => !current)}
                  />
                </div>
                <NoticeMessage notice={notice} />
                <button className={styles.primaryButton} type="submit">
                  {copy.login.action}
                  <ArrowRight className={styles.directionalIcon} aria-hidden="true" size={18} />
                </button>
              </form>
              <AuthSwitch action={copy.login.switchAction} href={signupHref} prefix={copy.login.switchPrefix} />
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
                {initialEmail || copy.verify.fallbackEmail}
              </strong>
              <p>{copy.verify.instructions}</p>
              <NoticeMessage notice={notice} />
              <button
                className={styles.secondaryButton}
                disabled={resendSeconds > 0}
                onClick={() => {
                  setResendSeconds(30);
                  setNotice({ tone: "success", text: copy.verify.resent });
                }}
                type="button"
              >
                <Mail aria-hidden="true" size={17} />
                {resendSeconds > 0 ? copy.verify.resendIn(resendSeconds) : copy.verify.resend}
              </button>
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

function AuthHeading({ body, icon: Icon, title }: { body: string; icon?: LucideIcon; title: string }) {
  return (
    <div className={styles.authHeading}>
      {Icon ? (
        <span aria-hidden="true">
          <Icon size={22} />
        </span>
      ) : null}
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}

function ProviderButtons({ copy, onProvider }: { copy: (typeof copyByLocale)[Locale]["provider"]; onProvider: (provider: "Apple" | "Google") => void }) {
  return (
    <div className={styles.providerStack}>
      <button className={styles.providerButton} onClick={() => onProvider("Google")} type="button">
        <Image alt="" aria-hidden="true" className={styles.googleLogo} height={32} src="/design-preview/providers/google-signin.svg" unoptimized width={32} />
        {copy.google}
      </button>
      <button className={styles.providerButton} onClick={() => onProvider("Apple")} type="button">
        <span className={styles.appleLogoFrame} aria-hidden="true">
          <Image alt="" className={styles.appleLogo} height={23} src="/design-preview/providers/apple-signin.png" unoptimized width={18} />
        </span>
        {copy.apple}
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
        <input autoComplete={autoComplete} id={id} onChange={(event) => onChange(event.target.value)} type={show ? "text" : "password"} value={password} />
        <button aria-label={show ? copy.hidePassword : copy.showPassword} className={styles.revealButton} onClick={toggle} type="button">
          {show ? <EyeOff aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
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
