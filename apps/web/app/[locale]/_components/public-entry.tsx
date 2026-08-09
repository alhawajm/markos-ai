"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
  Target,
  Wand2,
  Zap
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import { getBrowserApiBaseUrl } from "./api-base-url";
import { setBrowserSession, useMarkosSession } from "./browser-session";
import type { AuthSession, Locale } from "@markos/shared-types";
import { loginSchema, registerSchema } from "@markos/validation";

type AuthMode = "login" | "signup";

const apiBaseUrl = getBrowserApiBaseUrl();

export function PublicLandingPage({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar";
  const appHref = `/${locale}/app`;
  const loginHref = `/${locale}/login`;
  const signupHref = `/${locale}/signup`;
  const oppositeLocale = isArabic ? "en" : "ar";

  return (
    <main className="lux-page min-h-screen overflow-hidden text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-5 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a className="inline-flex items-center gap-3" href={`/${locale}`} aria-label="MARKOS AI">
            <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-[#D4AF37] bg-[#0F1419] text-[#81D8D0] shadow-[0_0_28px_rgba(129,216,208,.22)]">
              <Sparkles size={24} />
            </span>
            <span>
              <span className="block text-lg font-black tracking-wide">MARKOS AI</span>
              <span className="block text-xs font-bold uppercase tracking-[0.28em] text-[#8B95A8]">Marketing OS</span>
            </span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Public navigation">
            <a className="rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/6 px-4 py-2 text-sm font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/40 hover:text-white" href={`/${oppositeLocale}`}>
              {oppositeLocale === "ar" ? "العربية" : "English"}
            </a>
            <a className="rounded-full border border-[#81D8D0]/18 px-4 py-2 text-sm font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/40 hover:text-white" href={loginHref}>
              {isArabic ? "تسجيل الدخول" : "Log in"}
            </a>
            <a className="lux-button-primary rounded-full px-4 py-2 text-sm font-black transition hover:scale-[1.01]" href={signupHref}>
              {isArabic ? "ابدأ الآن" : "Start now"}
            </a>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.04fr_.96fr] lg:py-14">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/7 px-4 py-2 text-sm font-bold uppercase tracking-[0.22em] text-[#81D8D0]">
              <span className="lux-thinking-dot h-3 w-3" />
              {isArabic ? "رئيس تسويق ذكي لأعمال البحرين" : "AI Chief Marketing Officer for Bahrain SMBs"}
            </div>
            <h1 className="text-4xl font-black leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {isArabic ? "حوّل معرفة عملك إلى حملات إنستغرام جاهزة للنشر." : "Turn business memory into Instagram campaigns ready to launch."}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#C7CDD8] sm:text-xl">
              {isArabic
                ? "MARKOS يتعلم شركتك، يبني استراتيجية، يجهز المحتوى، يقترح أفضل وقت للنشر، ثم يقرأ النتائج ليحسن الدورة التالية."
                : "MARKOS learns your business, builds strategy, creates content, recommends the best posting window, then reads performance so the next cycle gets sharper."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="lux-button-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-black transition hover:scale-[1.01]" href={signupHref}>
                {isArabic ? "أنشئ مساحة العمل" : "Create workspace"} <ArrowRight size={19} />
              </a>
              <a className="inline-flex items-center gap-2 rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/6 px-6 py-3 text-base font-black text-[#D6DEEA] transition hover:border-[#81D8D0]/38 hover:text-white" href={loginHref}>
                {isArabic ? "ادخل إلى حسابك" : "Log in to portal"} <Lock size={18} />
              </a>
            </div>
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              <Proof label={isArabic ? "ذاكرة عمل دائمة" : "Workspace memory"} value="Vault" />
              <Proof label={isArabic ? "محتوى ثنائي اللغة" : "Bilingual content"} value="AR + EN" />
              <Proof label={isArabic ? "عملة محلية" : "Bahrain ready"} value="BHD" />
            </div>
          </div>

          <div className="lux-card rounded-[2rem] p-5 sm:p-6">
            <div className="rounded-[1.6rem] border border-[#81D8D0]/14 bg-[#0F1419]/62 p-5">
              <div className="flex items-center gap-4">
                <span className="lux-ai-core" />
                <div>
                  <p className="text-sm font-bold text-[#9AA7BD]">{isArabic ? "اليوم" : "Today"}</p>
                  <h2 className="text-2xl font-black">{isArabic ? "مهمة التسويق" : "Marketing mission"}</h2>
                </div>
              </div>
              <div className="mt-7 rounded-3xl border border-[#81D8D0]/16 bg-[#81D8D0]/7 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#81D8D0]">{isArabic ? "فرصة عالية التأثير" : "High-impact opportunity"}</p>
                <h3 className="mt-3 text-2xl font-black">{isArabic ? "أطلق حملة المجموعة الجديدة" : "Launch a premium campaign"}</h3>
                <p className="mt-3 text-[#C7CDD8]">
                  {isArabic ? "أفضل نافذة نشر: 7:30 مساء. الإيراد المتوقع: 450 د.ب." : "Best posting window: 7:30 PM. Estimated revenue potential: BD 450."}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <MiniMetric label={isArabic ? "الوصول" : "Reach"} value="2,400" />
                  <MiniMetric label={isArabic ? "العملاء" : "Leads"} value="28" />
                  <MiniMetric label={isArabic ? "العائد" : "Revenue"} value="3.2x" />
                </div>
              </div>
              <a className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#81D8D0] px-5 py-3 text-base font-black text-[#0F1419]" href={appHref}>
                {isArabic ? "ادخل مركز القيادة" : "Enter command center"} <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-8 md:grid-cols-4">
          <Feature icon={Brain} title={isArabic ? "Knowledge Vault" : "Knowledge Vault"} body={isArabic ? "يجمع معلومات الشركة والمنتجات والجمهور." : "Stores company, product, audience, and brand memory."} />
          <Feature icon={Target} title={isArabic ? "Strategy" : "Strategy"} body={isArabic ? "يحوّل الذاكرة إلى خطة تسويق عملية." : "Turns memory into a focused marketing plan."} />
          <Feature icon={Wand2} title={isArabic ? "Content Studio" : "Content Studio"} body={isArabic ? "ينشئ منشورات وريels وقصص جاهزة للمراجعة." : "Creates posts, reels, stories, and captions ready for review."} />
          <Feature icon={BarChart3} title={isArabic ? "Learning Loop" : "Learning Loop"} body={isArabic ? "يقرأ الأداء ويعيد التعلم داخل الخزنة." : "Reads performance and feeds learning back into the Vault."} />
        </section>
      </div>
    </main>
  );
}

export function AuthPortal({ locale, mode }: { locale: Locale; mode: AuthMode }) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<AuthMode>(mode);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [isHydrated, setHydrated] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const existingSession = useMarkosSession();
  const isArabic = locale === "ar";

  const client = useMemo(() => new MarkosApiClient({ baseUrl: apiBaseUrl }), []);

  useEffect(() => {
    setHydrated(true);

    if (new URLSearchParams(window.location.search).get("reason") === "session-expired") {
      setSessionExpired(true);
      setMessage(
        locale === "ar"
          ? "انتهت جلستك. سجّل الدخول مرة أخرى للمتابعة إلى ملفك الشخصي."
          : "Your session expired. Sign in again to continue to your profile."
      );
    }
  }, [locale]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (activeMode === "signup" && !acceptedTerms) {
      setMessage(isArabic ? "يجب قبول الشروط قبل إنشاء الحساب." : "Accept the terms before creating an account.");
      return;
    }

    setSubmitting(true);
    try {
      const session =
        activeMode === "login"
          ? await loginWithValidatedInput(client, {
              email,
              password,
              ...(totpCode.trim().length === 0 ? {} : { totpCode: totpCode.trim() })
            }, locale)
          : await registerWithValidatedInput(client, {
              email,
              fullName,
              locale,
              password,
              ...(workspaceName.trim().length === 0 ? {} : { workspaceName: workspaceName.trim() })
            }, locale);
      setBrowserSession(session);
      if (!session.user.isVerified) {
        window.sessionStorage.setItem("markos.pending-verification-email", session.user.email);
        router.push(`/${locale}/verify`);
        return;
      }

      router.push(activeMode === "login" ? (sessionExpired ? `/${locale}/app/settings#profile` : `/${locale}/app`) : `/${locale}/onboarding`);
    } catch (error) {
      setMessage(error instanceof Error ? friendlyAuthError(error.message, locale) : isArabic ? "تعذر إكمال الطلب." : "Could not complete the request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="lux-page min-h-screen text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-[1120px] items-center gap-8 px-5 py-6 lg:grid-cols-[.95fr_1.05fr] lg:px-8">
        <section className="hidden lg:block">
          <a className="mb-10 inline-flex items-center gap-3" href={`/${locale}`}>
            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-[#D4AF37] bg-[#0F1419] text-[#81D8D0]">
              <Sparkles size={26} />
            </span>
            <span>
              <span className="block text-xl font-black">MARKOS AI</span>
              <span className="block text-xs font-bold uppercase tracking-[0.28em] text-[#8B95A8]">Marketing OS</span>
            </span>
          </a>
          <h1 className="max-w-xl text-5xl font-black leading-tight">
            {isArabic ? "بوابتك إلى مركز قيادة التسويق الذكي." : "Your portal into the AI marketing command center."}
          </h1>
          <p className="mt-5 max-w-xl text-xl leading-relaxed text-[#C7CDD8]">
            {isArabic
              ? "سجّل الدخول للوصول إلى خزنة المعرفة، الاستراتيجية، صناعة المحتوى، الجدولة، والتحليلات."
              : "Sign in to access the Vault, strategy, content generation, scheduling, and analytics loop."}
          </p>
          <div className="mt-8 grid max-w-lg gap-3">
            <PortalStep icon={Brain} text={isArabic ? "كل قراءة وكتابة مرتبطة بمساحة العمل." : "Every read and write stays workspace-scoped."} />
            <PortalStep icon={Zap} text={isArabic ? "كل توليد ذكاء اصطناعي يُقاس بالحصص." : "Every AI action is metered against plan quotas."} />
            <PortalStep icon={Calendar} text={isArabic ? "النشر لا يتم بدون موافقة ومراجعة." : "Nothing publishes without review and approval."} />
          </div>
        </section>

        <section className="lux-card mx-auto w-full max-w-[520px] rounded-[2rem] p-5 sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <a className="inline-flex items-center gap-2 rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/6 px-4 py-2 text-sm font-bold text-[#D6DEEA]" href={`/${locale}`}>
              {isArabic ? "العودة" : "Back"}
            </a>
            <a className="rounded-full border border-[#81D8D0]/18 px-4 py-2 text-sm font-bold text-[#D6DEEA]" href={`/${locale === "ar" ? "en" : "ar"}/${activeMode}`}>
              {locale === "ar" ? "English" : "العربية"}
            </a>
          </div>

          <div className="grid grid-cols-2 rounded-full border border-[#81D8D0]/18 bg-[#0F1419]/54 p-1">
            <button className={authTabClass(activeMode === "login")} onClick={() => setActiveMode("login")} type="button">
              {isArabic ? "دخول" : "Log in"}
            </button>
            <button className={authTabClass(activeMode === "signup")} onClick={() => setActiveMode("signup")} type="button">
              {isArabic ? "حساب جديد" : "Sign up"}
            </button>
          </div>

          <h2 className="mt-7 text-3xl font-black">
            {activeMode === "login" ? (isArabic ? "تسجيل الدخول" : "Log in") : isArabic ? "إنشاء مساحة عمل" : "Create workspace"}
          </h2>
          <p className="mt-2 text-[#9AA7BD]">
            {activeMode === "login"
              ? isArabic ? "ادخل بياناتك للمتابعة إلى لوحة MARKOS." : "Enter your details to continue to MARKOS."
              : isArabic ? "ابدأ التجربة وأنشئ مساحة العمل الأولى." : "Start the trial and create your first workspace."}
          </p>

          {existingSession ? (
            <div className="mt-5 rounded-2xl border border-[#81D8D0]/18 bg-[#81D8D0]/7 p-4 text-sm text-[#C7CDD8]">
              <p className="font-bold text-white">{isArabic ? "هناك جلسة محفوظة." : "A saved session is available."}</p>
              <a className="mt-3 inline-flex items-center gap-2 font-black text-[#81D8D0]" href={`/${locale}/app`}>
                {isArabic ? "المتابعة إلى التطبيق" : "Continue to app"} <ArrowRight size={16} />
              </a>
            </div>
          ) : null}

          <form className="mt-6" onSubmit={handleSubmit}>
            <fieldset className="space-y-4 disabled:cursor-wait disabled:opacity-80" disabled={!isHydrated || isSubmitting}>
              {activeMode === "signup" ? (
                <>
                  <Field label={isArabic ? "الاسم الكامل" : "Full name"}>
                    <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
                  </Field>
                  <Field label={isArabic ? "اسم مساحة العمل" : "Workspace name"}>
                    <input className={inputClass} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder={isArabic ? "مثال: مجوهرات مريم" : "e.g. Maryam Jewelry"} />
                  </Field>
                </>
              ) : null}

              <Field label={isArabic ? "البريد الإلكتروني" : "Email"}>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8B95A8]" size={18} />
                  <input className={`${inputClass} pl-11`} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
                </span>
              </Field>

              <Field label={isArabic ? "كلمة المرور" : "Password"}>
                <span className="relative block">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8B95A8]" size={18} />
                  <input className={`${inputClass} pl-11 pr-12`} value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={activeMode === "login" ? "current-password" : "new-password"} />
                  <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA7BD]" onClick={() => setShowPassword((current) => !current)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </Field>

              {activeMode === "login" ? (
                <Field label={isArabic ? "رمز MFA اختياري" : "MFA code, optional"}>
                  <input className={inputClass} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" />
                </Field>
              ) : (
                <label className="flex items-start gap-3 rounded-2xl border border-[#81D8D0]/14 bg-[#81D8D0]/5 p-4 text-sm text-[#C7CDD8]">
                  <input checked={acceptedTerms} className="mt-1 accent-[#81D8D0]" onChange={(event) => setAcceptedTerms(event.target.checked)} type="checkbox" />
                  <span>{isArabic ? "أوافق على استخدام MARKOS لإنشاء مساحة عمل ومعالجة بياناتها وفق إعدادات الخصوصية." : "I agree to create a MARKOS workspace and process its data under the privacy settings."}</span>
                </label>
              )}

              {message ? <p className="rounded-2xl border border-[#F4A460]/24 bg-[#F4A460]/10 px-4 py-3 text-sm font-semibold text-[#F4A460]">{message}</p> : null}

              <button className="lux-button-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-black disabled:cursor-not-allowed disabled:opacity-60" disabled={!isHydrated || isSubmitting} type="submit">
                {isSubmitting ? (isArabic ? "جار المعالجة..." : "Working...") : activeMode === "login" ? (isArabic ? "دخول إلى MARKOS" : "Log in to MARKOS") : isArabic ? "إنشاء الحساب" : "Create account"}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
        </section>
      </div>
    </main>
  );
}

function Proof({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#81D8D0]/16 bg-[#81D8D0]/6 p-4">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-[#9AA7BD]">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#0F1419]/58 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8B95A8]">{label}</p>
      <p className="mt-1 text-xl font-black text-[#81D8D0]">{value}</p>
    </div>
  );
}

function Feature({ body, icon: Icon, title }: { body: string; icon: typeof Brain; title: string }) {
  return (
    <article className="lux-card-muted rounded-[1.5rem] p-5">
      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#81D8D0]/18 bg-[#81D8D0]/8 text-[#81D8D0]">
        <Icon size={22} />
      </div>
      <h3 className="mt-5 text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#9AA7BD]">{body}</p>
    </article>
  );
}

function PortalStep({ icon: Icon, text }: { icon: typeof Brain; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#81D8D0]/14 bg-[#81D8D0]/6 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#81D8D0]/10 text-[#81D8D0]">
        <Icon size={20} />
      </span>
      <p className="font-semibold text-[#D6DEEA]">{text}</p>
    </div>
  );
}

async function loginWithValidatedInput(
  client: MarkosApiClient,
  input: { email: string; password: string; totpCode?: string | undefined },
  locale: Locale
): Promise<AuthSession> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? (locale === "ar" ? "تحقق من البيانات المدخلة." : "Check the entered details."));
  }

  return client.login({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(parsed.data.totpCode === undefined ? {} : { totpCode: parsed.data.totpCode })
  });
}

async function registerWithValidatedInput(
  client: MarkosApiClient,
  input: { email: string; fullName: string; locale: Locale; password: string; workspaceName?: string | undefined },
  locale: Locale
): Promise<AuthSession> {
  const parsed = registerSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? (locale === "ar" ? "تحقق من البيانات المدخلة." : "Check the entered details."));
  }

  return client.register({
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    locale: parsed.data.locale,
    password: parsed.data.password,
    ...(parsed.data.workspaceName === undefined ? {} : { workspaceName: parsed.data.workspaceName })
  });
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-[#C7CDD8]">{label}</span>
      {children}
    </label>
  );
}

function authTabClass(active: boolean): string {
  return active
    ? "rounded-full bg-[#81D8D0] px-4 py-2 text-sm font-black text-[#0F1419]"
    : "rounded-full px-4 py-2 text-sm font-bold text-[#9AA7BD] transition hover:text-white";
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[#81D8D0]/16 bg-[#0F1419]/64 px-4 text-base font-semibold text-white outline-none transition placeholder:text-[#657085] focus:border-[#81D8D0]/50";

function friendlyAuthError(message: string, locale: Locale): string {
  const lower = message.toLowerCase();

  if (lower.includes("email verification")) {
    return locale === "ar" ? "يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول." : "Verify your email before logging in.";
  }

  if (lower.includes("invalid email or password") || lower.includes("invalid credentials")) {
    return locale === "ar" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "Email or password is incorrect.";
  }

  if (lower.includes("already exists")) {
    return locale === "ar" ? "هذا البريد مستخدم مسبقاً. جرّب تسجيل الدخول." : "This email already exists. Try logging in.";
  }

  if (lower.includes("mfa")) {
    return locale === "ar" ? "أدخل رمز التحقق المكوّن من 6 أرقام." : "Enter the 6-digit MFA code.";
  }

  return message;
}
