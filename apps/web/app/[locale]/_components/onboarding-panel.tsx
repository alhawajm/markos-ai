"use client";

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  Facebook,
  Gem,
  Instagram,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Twitter,
  Upload,
  Zap
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MarkosApiClient } from "@markos/api-client";
import { getBrowserApiBaseUrl } from "./api-base-url";
import type { AuthSession, Locale } from "@markos/shared-types";

const sessionKey = "markos.session";
const draftKey = "markos.onboarding.draft";
const apiBaseUrl = getBrowserApiBaseUrl();

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Icon = ComponentType<{ className?: string; color?: string; size?: number; strokeWidth?: number }>;
type SelectOption = { label: string; value: string };

interface OnboardingDraft {
  ageRange: string;
  brandColor: string;
  channels: Record<"facebook" | "instagram" | "twitter", boolean>;
  companyName: string;
  competitors: string[];
  description: string;
  genderFocus: string;
  goals: string[];
  industry: string;
  languagePreference: string;
  location: string;
  logoUploaded: boolean;
  newCompetitor: string;
  painPoints: string;
  tone: string;
  website: string;
}

const toneMeta: Array<{ icon: Icon; id: string }> = [
  { id: "professional", icon: BriefcaseBusiness },
  { id: "friendly", icon: CheckCircle2 },
  { id: "bold", icon: Zap },
  { id: "luxury", icon: Gem },
  { id: "playful", icon: Sparkles },
  { id: "informative", icon: BookOpen }
];

const goalValues = [
  "Increase brand awareness",
  "Drive website traffic",
  "Generate leads",
  "Boost sales",
  "Build community",
  "Customer retention"
];

function onboardingCopy(locale: Locale) {
  if (locale === "ar") {
    return {
      add: "إضافة",
      addCompetitorPlaceholder: "أضف اسم منافس...",
      aiCardBody: "يتعلم MARKOS علامتك خلال دقائق ويولّد محتوى يشبه صوتك من اليوم الأول.",
      aiCardTitle: "إعداد مدعوم بالذكاء الاصطناعي",
      back: "السابق",
      brand: {
        color: "لون العلامة الأساسي",
        logoDone: "تم رفع الشعار",
        logoHint: "PNG أو SVG أو JPG حتى 10MB",
        logoIdle: "اسحب الشعار هنا أو اضغط للرفع",
        tone: "نبرة صوت العلامة *",
        title: "ارفع أصول علامتك",
        body: "يساعد الشعار والألوان MARKOS في الحفاظ على اتساق بصري واضح."
      },
      build: "ابنِ الذكاء الاصطناعي",
      channels: {
        body: "اربط حسابات التواصل للنشر مباشرة من MARKOS.",
        connected: "متصل",
        connect: "ربط",
        notConnected: "غير متصل",
        title: "اربط قنواتك"
      },
      company: {
        body: "يساعد هذا MARKOS على إنشاء محتوى يمثل علامتك بدقة.",
        description: "وصف النشاط",
        industry: "القطاع *",
        name: "اسم الشركة *",
        title: "حدثنا عن شركتك",
        website: "الموقع الإلكتروني"
      },
      complete: "مكتمل",
      competitors: {
        body: "سيحلل MARKOS استراتيجيات محتواهم ليساعدك على التقدم.",
        hint: "يمكنك إضافة المزيد لاحقاً من الإعدادات.",
        title: "من هم منافسوك؟"
      },
      continue: "متابعة",
      errors: {
        complete: "تعذر إنهاء الإعداد الآن.",
        save: "تعذر حفظ هذه الخطوة الآن."
      },
      goals: {
        body: "اختر كل ما ينطبق. سيضبط MARKOS استراتيجية المحتوى وفقاً لذلك.",
        title: "ما أهدافك من المحتوى؟"
      },
      launch: "افتح لوحة MARKOS",
      progress: (step: StepId, total: number) => `الخطوة ${step} من ${total}`,
      saved: "تم الحفظ في الخزنة",
      setup: {
        body: "يحلل MARKOS القطاع والمنافسين والأهداف لبناء طبقة ذكاء تسويقي مخصصة.",
        loadingTitle: "نبني ذكاء علامتك...",
        readyBody: "تعلم MARKOS علامتك. أنت جاهز لإنشاء محتوى مدعوم بالذكاء الاصطناعي يحقق نتائج.",
        readyTitle: "ذكاء علامتك جاهز!",
        stats: [
          { value: "94%", label: "درجة مطابقة العلامة" },
          { value: "47", label: "أفكار محتوى جاهزة" },
          { value: "3", label: "قنوات مرتبطة" }
        ],
        tasks: [
          "فحص اتجاهات القطاع في البحرين",
          "تحليل استراتيجيات محتوى المنافسين",
          "بناء نموذج صوت العلامة",
          "توليد إطار تقويم المحتوى",
          "إنهاء إعدادات الذكاء الاصطناعي"
        ]
      },
      steps: [
        { id: 1 as const, label: "معلومات الشركة", desc: "عرّفنا على نشاطك" },
        { id: 2 as const, label: "هوية العلامة", desc: "ارفع أصولك" },
        { id: 3 as const, label: "الجمهور المستهدف", desc: "من تخدم؟" },
        { id: 4 as const, label: "المنافسون", desc: "اعرف السوق" },
        { id: 5 as const, label: "قنوات التواصل", desc: "اربط حساباتك" },
        { id: 6 as const, label: "أهداف المحتوى", desc: "حدد أهدافك" },
        { id: 7 as const, label: "إعداد الذكاء", desc: "نبني ذكاء علامتك" }
      ],
      audience: {
        age: "الفئة العمرية",
        body: "فهم جمهورك يساعد MARKOS على صياغة رسائل مؤثرة.",
        gender: "تركيز الجنس",
        language: "تفضيلات اللغة",
        location: "الموقع",
        painPoints: "نقاط ألم العملاء",
        title: "من هو جمهورك؟"
      }
    };
  }

  return {
    add: "Add",
    addCompetitorPlaceholder: "Add competitor name...",
    aiCardBody: "MARKOS learns your brand in minutes and generates content that sounds like you from day one.",
    aiCardTitle: "AI-Powered Setup",
    back: "Back",
    brand: {
      color: "Primary Brand Color",
      logoDone: "Logo uploaded",
      logoHint: "PNG, SVG, JPG up to 10MB",
      logoIdle: "Drop your logo here or click to upload",
      tone: "Brand Tone of Voice *",
      title: "Upload your brand assets",
      body: "Your logo and brand colors help MARKOS maintain visual consistency."
    },
    build: "Build My AI",
    channels: {
      body: "Connect your social accounts to publish directly from MARKOS.",
      connected: "Connected",
      connect: "Connect",
      notConnected: "Not connected",
      title: "Connect your channels"
    },
    company: {
      body: "This helps MARKOS create content that truly represents your brand.",
      description: "Business Description",
      industry: "Industry *",
      name: "Company Name *",
      title: "Tell us about your company",
      website: "Website"
    },
    complete: "complete",
    competitors: {
      body: "MARKOS will analyze their content strategies to help you stay ahead.",
      hint: "You can always add more later from Settings.",
      title: "Who are your competitors?"
    },
    continue: "Continue",
    errors: {
      complete: "Could not complete onboarding yet.",
      save: "Could not save this step yet."
    },
    goals: {
      body: "Select all that apply. MARKOS will optimize your content strategy accordingly.",
      title: "What are your content goals?"
    },
    launch: "Launch MARKOS Dashboard",
    progress: (step: StepId, total: number) => `Step ${step} of ${total}`,
    saved: "Saved to Vault",
    setup: {
      body: "Analyzing your industry, competitors, and goals to create a personalized marketing intelligence layer.",
      loadingTitle: "Building Your Brand AI...",
      readyBody: "MARKOS has learned your brand. You're ready to create AI-powered content that converts.",
      readyTitle: "Your Brand AI is Ready!",
      stats: [
        { value: "94%", label: "Brand Match Score" },
        { value: "47", label: "Content Ideas Ready" },
        { value: "3", label: "Channels Connected" }
      ],
      tasks: [
        "Scanning industry trends in Bahrain",
        "Analyzing competitor content strategies",
        "Building your brand voice model",
        "Generating content calendar framework",
        "Finalizing AI configuration"
      ]
    },
    steps: [
      { id: 1 as const, label: "Company Info", desc: "Tell us about your business" },
      { id: 2 as const, label: "Brand Identity", desc: "Upload your assets" },
      { id: 3 as const, label: "Target Audience", desc: "Who do you serve?" },
      { id: 4 as const, label: "Competitors", desc: "Know your market" },
      { id: 5 as const, label: "Social Channels", desc: "Connect your accounts" },
      { id: 6 as const, label: "Content Goals", desc: "Set your objectives" },
      { id: 7 as const, label: "AI Setup", desc: "Building your brand AI" }
    ],
    audience: {
      age: "Age Range",
      body: "Understanding your audience helps MARKOS craft messages that resonate.",
      gender: "Gender Focus",
      language: "Language Preferences",
      location: "Location",
      painPoints: "Customer Pain Points",
      title: "Who is your audience?"
    }
  };
}

function industryOptions(locale: Locale): SelectOption[] {
  const labels =
    locale === "ar"
      ? ["التجزئة والتجارة الإلكترونية", "المطاعم والمقاهي", "العقارات", "الرعاية الصحية", "التعليم", "السيارات", "الأزياء والجمال", "التقنية", "المالية", "الضيافة"]
      : ["Retail & E-commerce", "Food & Beverage", "Real Estate", "Healthcare", "Education", "Automotive", "Fashion & Beauty", "Technology", "Finance", "Hospitality"];
  const values = ["Retail & E-commerce", "Food & Beverage", "Real Estate", "Healthcare", "Education", "Automotive", "Fashion & Beauty", "Technology", "Finance", "Hospitality"];

  return values.map((value, index) => ({ value, label: labels[index] ?? value }));
}

function toneLabel(locale: Locale, toneId: string) {
  const ar: Record<string, string> = {
    professional: "احترافية",
    friendly: "ودودة",
    bold: "جريئة ونشطة",
    luxury: "فاخرة",
    playful: "مرحة",
    informative: "معلوماتية"
  };
  const en: Record<string, string> = {
    professional: "Professional",
    friendly: "Friendly",
    bold: "Bold & Energetic",
    luxury: "Luxury",
    playful: "Playful",
    informative: "Informative"
  };

  return locale === "ar" ? ar[toneId] : en[toneId];
}

function goalOptions(locale: Locale): SelectOption[] {
  const ar = ["زيادة الوعي بالعلامة", "زيادة زيارات الموقع", "توليد العملاء المحتملين", "رفع المبيعات", "بناء مجتمع", "الاحتفاظ بالعملاء"];
  return goalValues.map((value, index) => ({ value, label: locale === "ar" ? ar[index] ?? value : value }));
}

function genderOptions(locale: Locale): SelectOption[] {
  return [
    { value: "All", label: locale === "ar" ? "الكل" : "All" },
    { value: "Male", label: locale === "ar" ? "ذكور" : "Male" },
    { value: "Female", label: locale === "ar" ? "إناث" : "Female" }
  ];
}

function languageOptions(locale: Locale): SelectOption[] {
  return [
    { value: "Arabic", label: locale === "ar" ? "العربية" : "Arabic" },
    { value: "English", label: locale === "ar" ? "الإنجليزية" : "English" },
    { value: "Both", label: locale === "ar" ? "اللغتان" : "Both" }
  ];
}

type OnboardingCopy = ReturnType<typeof onboardingCopy>;

const defaultDraft: OnboardingDraft = {
  ageRange: "25-34",
  brandColor: "#0F3460",
  channels: { facebook: true, instagram: true, twitter: false },
  companyName: "Zain Arabia",
  competitors: ["STC Bahrain", "Batelco"],
  description: "Leading telecommunications company serving Bahrain with mobile, internet, and digital services.",
  genderFocus: "All",
  goals: ["Increase brand awareness", "Build community"],
  industry: "Technology",
  languagePreference: "Both",
  location: "Bahrain, GCC Region",
  logoUploaded: false,
  newCompetitor: "",
  painPoints: "Need reliable connectivity, digital transformation support, competitive pricing",
  tone: "professional",
  website: "https://zain.com.bh"
};

function defaultDraftForLocale(locale: Locale): OnboardingDraft {
  if (locale !== "ar") return defaultDraft;

  return {
    ...defaultDraft,
    companyName: "زين العربية",
    description: "شركة اتصالات رائدة تخدم البحرين بخدمات الهاتف والإنترنت والحلول الرقمية.",
    location: "البحرين، دول الخليج",
    painPoints: "الحاجة إلى اتصال موثوق، دعم التحول الرقمي، وأسعار تنافسية"
  };
}

export function OnboardingPanel({ locale }: { locale: Locale }) {
  const copy = onboardingCopy(locale);
  const isRtl = locale === "ar";
  const steps = copy.steps;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(100);
  const [draft, setDraft] = useState<OnboardingDraft>(() => defaultDraftForLocale(locale));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [step, setStep] = useState<StepId>(1);
  const router = useRouter();

  const client = useMemo(() => {
    const options = { baseUrl: apiBaseUrl } satisfies { baseUrl: string; accessToken?: string; workspaceId?: string };

    return new MarkosApiClient(
      session
        ? {
            ...options,
            accessToken: session.tokens.accessToken,
            workspaceId: session.workspace.id
          }
        : options
    );
  }, [session]);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(sessionKey);
    const storedDraft = window.localStorage.getItem(draftKey);

    const baseDraft = defaultDraftForLocale(locale);
    if (storedSession) setSession(JSON.parse(storedSession) as AuthSession);
    if (storedDraft) setDraft({ ...baseDraft, ...(JSON.parse(storedDraft) as Partial<OnboardingDraft>) });
    setStep(getInitialStep());
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (step !== 7 || aiProgress === 100) return;

    const timer = window.setInterval(() => {
      setAiProgress((current) => {
        const next = Math.min(100, current + 20);
        if (next === 100) {
          window.clearInterval(timer);
          setAiLoading(false);
        }
        return next;
      });
    }, 260);

    return () => window.clearInterval(timer);
  }, [aiProgress, step]);

  const progress = Math.round((step / steps.length) * 100);

  async function next() {
    await persistStep(step);

    if (step === 6) {
      setStep(7);
      setAiLoading(true);
      setAiProgress(0);
      return;
    }

    if (step < 7) {
      setStep((current) => (current + 1) as StepId);
      setMessage("");
    }
  }

  function back() {
    setStep((current) => Math.max(1, current - 1) as StepId);
    setMessage("");
  }

  async function launchDashboard() {
    await persistStep(6);

    if (session) {
      setSaving(true);
      try {
        await client.completeOnboarding();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : copy.errors.complete);
        setSaving(false);
        return;
      }
    }

    router.push(`/${locale}`);
  }

  async function persistStep(stepToSave: StepId) {
    if (!session || stepToSave === 5 || stepToSave === 7) return;

    setSaving(true);
    setMessage("");

    try {
      const payload = payloadForStep(stepToSave, draft);
      if (payload) await client.saveOnboardingModule(payload.module, payload.body);
      setMessage(copy.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function addCompetitor() {
    const name = draft.newCompetitor.trim();
    if (!name) return;
    setDraft((current) => ({ ...current, competitors: [...current.competitors, name], newCompetitor: "" }));
  }

  function removeCompetitor(index: number) {
    setDraft((current) => ({ ...current, competitors: current.competitors.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function toggleGoal(goal: string) {
    setDraft((current) => ({
      ...current,
      goals: current.goals.includes(goal) ? current.goals.filter((item) => item !== goal) : [...current.goals, goal]
    }));
  }

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const NextIcon = isRtl ? ArrowLeft : ArrowRight;

  return (
    <section className="flex min-h-screen bg-[linear-gradient(135deg,#0F3460_0%,#1A1A2E_50%,#0a0a1a_100%)] text-white" dir={isRtl ? "rtl" : "ltr"}>
      <aside className={isRtl ? "hidden w-80 shrink-0 flex-col justify-between border-l border-white/[.08] p-10 lg:flex" : "hidden w-80 shrink-0 flex-col justify-between border-r border-white/[.08] p-10 lg:flex"}>
        <div>
          <a className="mb-12 flex items-center gap-3" href={`/${locale}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent shadow-[0_4px_16px_rgba(233,69,96,.35)]">
              <Sparkles size={20} strokeWidth={2.4} />
            </span>
            <span className="font-display text-xl font-bold tracking-normal">MARKOS AI</span>
          </a>

          <nav className="grid gap-1" aria-label="Onboarding steps">
            {steps.map((item) => {
              const active = step === item.id;
              const complete = step > item.id;

              return (
                <button className="flex items-center gap-3 py-2.5 text-start" key={item.id} onClick={() => setStep(item.id)} type="button">
                  <span
                    className={
                      complete
                        ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white"
                        : active
                          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white"
                          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[.08] text-xs font-bold text-white"
                    }
                  >
                    {complete ? <CheckCircle2 size={14} /> : item.id}
                  </span>
                  <span>
                    <span className={active || complete ? "block text-[13px] font-semibold text-white" : "block text-[13px] text-white/40"}>{item.label}</span>
                    <span className="block text-[11px] text-white/30">{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="rounded-xl border border-accent/25 bg-accent/15 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-accent">
            <Sparkles size={14} />
            {copy.aiCardTitle}
          </div>
          <p className="text-xs leading-5 text-white/60">{copy.aiCardBody}</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 items-start justify-center overflow-x-hidden overflow-y-auto px-5 py-6 sm:p-8 lg:items-center">
        <div className="w-full min-w-0 max-w-[310px] sm:max-w-[560px]">
          <div className="mb-8">
            <div className="mb-2 flex justify-between text-xs text-white/50">
              <span>{copy.progress(step, steps.length)}</span>
              <span>
                {progress}%<span className="hidden sm:inline"> {copy.complete}</span>
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#E94560,#f472b6)] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,.18)] backdrop-blur sm:p-8">
            {step === 1 ? <CompanyStep copy={copy} draft={draft} locale={locale} update={update} /> : null}
            {step === 2 ? <BrandStep copy={copy} draft={draft} locale={locale} update={update} /> : null}
            {step === 3 ? <AudienceStep copy={copy} draft={draft} locale={locale} update={update} /> : null}
            {step === 4 ? <CompetitorsStep addCompetitor={addCompetitor} copy={copy} draft={draft} removeCompetitor={removeCompetitor} update={update} /> : null}
            {step === 5 ? <ChannelsStep copy={copy} draft={draft} update={update} /> : null}
            {step === 6 ? <GoalsStep copy={copy} draft={draft} locale={locale} toggleGoal={toggleGoal} /> : null}
            {step === 7 ? <AiSetupStep aiLoading={aiLoading} aiProgress={aiProgress} copy={copy} launchDashboard={launchDashboard} saving={saving} /> : null}

            {message ? <p className="mt-5 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-white/55">{message}</p> : null}

            {step < 7 ? (
              <div className="mt-6 flex items-center justify-between sm:mt-8">
                <button
                  className="flex items-center gap-2 rounded-lg bg-white/[.06] px-4 py-2.5 text-sm text-white/60 transition hover:bg-white/[.09] disabled:bg-transparent disabled:text-white/20"
                  disabled={step === 1 || saving}
                  onClick={back}
                  type="button"
                >
                  <BackIcon size={16} />
                  {copy.back}
                </button>
                <button
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(233,69,96,.3)] transition hover:opacity-90 disabled:opacity-60"
                  disabled={saving}
                  onClick={next}
                  type="button"
                >
                  {step === 6 ? copy.build : copy.continue}
                  <NextIcon size={16} />
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </section>
  );
}

function CompanyStep({ copy, draft, locale, update }: StepProps & { copy: OnboardingCopy; locale: Locale }) {
  return (
    <div>
      <StepHeading body={copy.company.body} title={copy.company.title} />
      <div className="grid gap-4">
        <DarkField label={copy.company.name} onChange={(value) => update("companyName", value)} value={draft.companyName} />
        <DarkSelect label={copy.company.industry} onChange={(value) => update("industry", value)} options={industryOptions(locale)} value={draft.industry} />
        <DarkField label={copy.company.website} onChange={(value) => update("website", value)} value={draft.website} />
        <DarkField area label={copy.company.description} onChange={(value) => update("description", value)} value={draft.description} />
      </div>
    </div>
  );
}

function BrandStep({ copy, draft, locale, update }: StepProps & { copy: OnboardingCopy; locale: Locale }) {
  return (
    <div>
      <StepHeading body={copy.brand.body} title={copy.brand.title} />
      <button
        className={
          draft.logoUploaded
            ? "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-success/70 bg-success/10 p-5 text-success sm:min-h-36 sm:gap-3 sm:p-6"
            : "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[.03] p-5 text-white/45 transition hover:border-accent/60 hover:text-white/65 sm:min-h-36 sm:gap-3 sm:p-6"
        }
        onClick={() => update("logoUploaded", !draft.logoUploaded)}
        type="button"
      >
        {draft.logoUploaded ? <CheckCircle2 size={28} /> : <Upload size={28} />}
        <span className="text-sm font-semibold">{draft.logoUploaded ? copy.brand.logoDone : copy.brand.logoIdle}</span>
        <span className="text-xs text-white/30">{copy.brand.logoHint}</span>
      </button>

      <section className="mt-5 sm:mt-6">
        <Label>{copy.brand.tone}</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {toneMeta.map((tone) => {
            const Icon = tone.icon;
            const active = draft.tone === tone.id;
            return (
              <button
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent/20 p-2.5 text-center text-accent sm:p-3"
                    : "rounded-lg border border-white/10 bg-white/[.05] p-2.5 text-center text-white/55 transition hover:border-white/20 hover:text-white/75 sm:p-3"
                }
                key={tone.id}
                onClick={() => update("tone", tone.id)}
                type="button"
              >
                <Icon className="mx-auto" size={18} />
                <span className="mt-2 block text-xs font-semibold">{toneLabel(locale, tone.id)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 sm:mt-6">
        <Label>{copy.brand.color}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {["#E94560", "#0F3460", "#22C55E", "#F59E0B", "#6366F1", "#EC4899", "#111827"].map((color) => (
            <button
              aria-label={`${copy.brand.color} ${color}`}
              className={draft.brandColor === color ? "h-8 w-8 rounded-lg border-[3px] border-white sm:h-9 sm:w-9" : "h-8 w-8 rounded-lg border-[3px] border-transparent sm:h-9 sm:w-9"}
              key={color}
              onClick={() => update("brandColor", color)}
              style={{ background: color }}
              type="button"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AudienceStep({ copy, draft, locale, update }: StepProps & { copy: OnboardingCopy; locale: Locale }) {
  return (
    <div>
      <StepHeading body={copy.audience.body} title={copy.audience.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DarkSelect label={copy.audience.age} onChange={(value) => update("ageRange", value)} options={["18-24", "25-34", "35-44", "45+"].map((value) => ({ label: value, value }))} value={draft.ageRange} />
        <DarkSelect label={copy.audience.gender} onChange={(value) => update("genderFocus", value)} options={genderOptions(locale)} value={draft.genderFocus} />
        <div className="sm:col-span-2">
          <DarkField label={copy.audience.location} onChange={(value) => update("location", value)} value={draft.location} />
        </div>
        <div className="sm:col-span-2">
          <DarkField area label={copy.audience.painPoints} onChange={(value) => update("painPoints", value)} value={draft.painPoints} />
        </div>
      </div>
      <section className="mt-6">
        <Label>{copy.audience.language}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {languageOptions(locale).map((language) => (
            <button
              className={
                draft.languagePreference === language.value
                  ? "rounded-lg border border-accent bg-accent/20 px-4 py-2 text-sm font-semibold text-accent"
                  : "rounded-lg border border-white/10 bg-white/[.05] px-4 py-2 text-sm text-white/55"
              }
              key={language.value}
              onClick={() => update("languagePreference", language.value)}
              type="button"
            >
              {language.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CompetitorsStep({
  addCompetitor,
  copy,
  draft,
  removeCompetitor,
  update
}: StepProps & {
  addCompetitor: () => void;
  copy: OnboardingCopy;
  removeCompetitor: (index: number) => void;
}) {
  return (
    <div>
      <StepHeading body={copy.competitors.body} title={copy.competitors.title} />
      <div className="grid gap-3">
        {draft.competitors.map((competitor, index) => (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[.07] px-4 py-3" key={competitor}>
            <Target className="text-accent" size={16} />
            <span className="flex-1 text-sm font-semibold text-white">{competitor}</span>
            <button aria-label={`Remove ${competitor}`} className="text-white/40 transition hover:text-accent" onClick={() => removeCompetitor(index)} type="button">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent"
          onChange={(event) => update("newCompetitor", event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addCompetitor();
          }}
          placeholder={copy.addCompetitorPlaceholder}
          value={draft.newCompetitor}
        />
        <button className="flex items-center gap-1 rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={addCompetitor} type="button">
          <Plus size={16} />
          {copy.add}
        </button>
      </div>
      <p className="mt-2 text-xs text-white/30">{copy.competitors.hint}</p>
    </div>
  );
}

function ChannelsStep({ copy, draft, update }: StepProps & { copy: OnboardingCopy }) {
  const channels = [
    { id: "instagram" as const, label: "Instagram", handle: "@zain_bh", icon: Instagram, color: "#E1306C" },
    { id: "facebook" as const, label: "Facebook", handle: "Zain Bahrain", icon: Facebook, color: "#1877F2" },
    { id: "twitter" as const, label: "X (Twitter)", handle: "Not connected", icon: Twitter, color: "#111827" }
  ];

  return (
    <div>
      <StepHeading body={copy.channels.body} title={copy.channels.title} />
      <div className="grid gap-3">
        {channels.map((channel) => {
          const Icon = channel.icon;
          const connected = draft.channels[channel.id];
          return (
            <article className={connected ? "flex items-center gap-4 rounded-xl border border-success/30 bg-white/[.05] p-4" : "flex items-center gap-4 rounded-xl border border-white/10 bg-white/[.05] p-4"} key={channel.id}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${channel.color}22` }}>
                <Icon color={channel.color} size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">{channel.label}</h3>
                <p className={connected ? "text-xs text-success" : "text-xs text-white/30"}>{connected ? channel.handle : copy.channels.notConnected}</p>
              </div>
              <button
                className={connected ? "rounded-lg border border-success/30 bg-success/15 px-3 py-1.5 text-xs font-semibold text-success" : "rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"}
                onClick={() => update("channels", { ...draft.channels, [channel.id]: !connected })}
                type="button"
              >
                {connected ? copy.channels.connected : copy.channels.connect}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function GoalsStep({ copy, draft, locale, toggleGoal }: { copy: OnboardingCopy; draft: OnboardingDraft; locale: Locale; toggleGoal: (goal: string) => void }) {
  return (
    <div>
      <StepHeading body={copy.goals.body} title={copy.goals.title} />
      <div className="grid gap-3 sm:grid-cols-2">
        {goalOptions(locale).map((goal) => {
          const active = draft.goals.includes(goal.value);
          return (
            <button
              className={active ? "rounded-xl border border-accent bg-accent/15 p-4 text-start" : "rounded-xl border border-white/10 bg-white/[.05] p-4 text-start transition hover:border-white/20"}
              key={goal.value}
              onClick={() => toggleGoal(goal.value)}
              type="button"
            >
              <span className="flex items-center gap-2">
                <span className={active ? "flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent" : "h-[18px] w-[18px] rounded-full bg-white/10"}>
                  {active ? <CheckCircle2 size={12} /> : null}
                </span>
                <span className={active ? "text-sm font-semibold text-white" : "text-sm text-white/55"}>{goal.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AiSetupStep({
  aiLoading,
  aiProgress,
  copy,
  launchDashboard,
  saving
}: {
  aiLoading: boolean;
  aiProgress: number;
  copy: OnboardingCopy;
  launchDashboard: () => void;
  saving: boolean;
}) {
  if (aiLoading) {
    const taskDoneAt = [20, 45, 65, 82, 100];

    return (
      <div className="py-4 text-center">
        <BrandAiMark pulse />
        <StepHeading center body={copy.setup.body} title={copy.setup.loadingTitle} />
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#E94560,#f472b6,#E94560)] transition-all duration-300" style={{ width: `${aiProgress}%` }} />
        </div>
        <div className="grid gap-2 text-start">
          {copy.setup.tasks.map((task, index) => {
            const done = aiProgress >= (taskDoneAt[index] ?? 100);
            return (
            <div className="flex items-center gap-3" key={task}>
              <span className={done ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-white/20"} />
              <span className={done ? "text-[13px] text-success" : "text-[13px] text-white/40"}>{task}</span>
            </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 text-center">
      <BrandAiMark />
      <StepHeading center body={copy.setup.readyBody} title={copy.setup.readyTitle} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {copy.setup.stats.map((stat) => (
          <div className="rounded-xl border border-white/10 bg-white/[.06] p-3" key={stat.label}>
            <p className="font-display text-[22px] font-bold text-accent">{stat.value}</p>
            <p className="text-[11px] text-white/50">{stat.label}</p>
          </div>
        ))}
      </div>
      <button
        className="w-full rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] py-3.5 text-base font-bold text-white shadow-[0_4px_20px_rgba(233,69,96,.4)] transition hover:opacity-90 disabled:opacity-60"
        disabled={saving}
        onClick={launchDashboard}
        type="button"
      >
        {copy.launch}
      </button>
    </div>
  );
}

interface StepProps {
  draft: OnboardingDraft;
  update: <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void;
}

function StepHeading({ body, center = false, title }: { body: string; center?: boolean; title: string }) {
  return (
    <div className={center ? "mb-5 text-center sm:mb-7" : "mb-5 sm:mb-7"}>
      <h2 className="font-display text-[22px] font-bold tracking-normal text-white sm:text-2xl">{title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-white/50 sm:mt-2">{body}</p>
    </div>
  );
}

function BrandAiMark({ pulse = false }: { pulse?: boolean }) {
  return (
    <div className="mb-6 flex justify-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-accent/40 bg-[linear-gradient(135deg,rgba(233,69,96,.3),rgba(15,52,96,.3))]">
        <Sparkles className={pulse ? "animate-pulse text-accent" : "text-accent"} size={32} />
      </div>
    </div>
  );
}

function DarkField({
  area,
  label,
  onChange,
  value
}: {
  area?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      <Label>{label}</Label>
      {area ? (
        <textarea className="mt-1.5 min-h-24 w-full resize-none rounded-lg border border-white/10 bg-white/[.07] px-4 py-3 text-[15px] text-white outline-none focus:border-accent" onChange={(event) => onChange(event.target.value)} value={value} />
      ) : (
        <input className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[.07] px-4 py-3 text-[15px] text-white outline-none focus:border-accent" onChange={(event) => onChange(event.target.value)} value={value} />
      )}
    </label>
  );
}

function DarkSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}) {
  return (
    <label>
      <Label>{label}</Label>
      <select className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#2d2d42] px-4 py-3 text-[15px] text-white outline-none focus:border-accent" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-[.06em] text-white/60">{children}</span>;
}

function payloadForStep(step: StepId, draft: OnboardingDraft): { body: Record<string, unknown>; module: string } | null {
  if (step === 1) {
    return {
      module: "company",
      body: {
        industry: draft.industry,
        languages: draft.languagePreference === "Both" ? ["Arabic", "English"] : [draft.languagePreference],
        location: draft.location,
        name: draft.companyName,
        socials: ["instagram.com/zain_bh"],
        website: draft.website
      }
    };
  }

  if (step === 2) {
    return {
      module: "brand",
      body: {
        aestheticWords: ["clean", "modern", "confident"],
        colors: [draft.brandColor, "#E94560"],
        fonts: ["Inter", "Space Grotesk"],
        toneWords: [draft.tone],
        voiceNotes: "Professional, bilingual, helpful, and confident."
      }
    };
  }

  if (step === 3) {
    return {
      module: "audience",
      body: {
        ageRange: draft.ageRange,
        demographics: draft.genderFocus,
        genderBreakdown: draft.genderFocus,
        interests: ["Connectivity", "Digital services", "Business growth"],
        locations: draft.location.split(",").map((item) => item.trim()).filter(Boolean),
        motivations: ["Reliability", "Speed", "Competitive pricing"],
        painPoints: draft.painPoints.split(",").map((item) => item.trim()).filter(Boolean)
      }
    };
  }

  if (step === 4) {
    return {
      module: "competitors",
      body: {
        competitiveAdvantage: "Bilingual digital-first customer experience.",
        doDifferently: "Publish clearer, more helpful content with consistent audience timing.",
        items: draft.competitors.map((name) => ({ name }))
      }
    };
  }

  if (step === 6) {
    return {
      module: "objectives",
      body: {
        budgetRange: "BHD 500-1500",
        goals: draft.goals,
        instagramExperience: "Active business account",
        kpiTargets: { engagementRate: "4.8%" },
        success90Days: "More consistent content, higher engagement, and clearer campaign rhythm."
      }
    };
  }

  return null;
}

function getInitialStep(): StepId {
  if (typeof window === "undefined") return 1;
  const value = Number(new URLSearchParams(window.location.search).get("step") ?? "1");
  return value >= 1 && value <= 7 ? (value as StepId) : 1;
}
