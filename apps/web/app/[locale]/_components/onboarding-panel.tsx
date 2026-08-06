"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  Gem,
  Languages,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  WandSparkles,
  Zap
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { BusinessProfile, Locale, OnboardingBusinessProfileState } from "@markos/shared-types";
import { initializeBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import { NotificationToast } from "./notification-toast";
import {
  createEmptyOnboardingDraft,
  legacyOnboardingDraftKey,
  onboardingDraftKey,
  payloadForOnboardingStep,
  validateOnboardingStep,
  type OnboardingDraft,
  type OnboardingProductDraft,
  type OnboardingStepId
} from "./onboarding-draft";

type StepId = OnboardingStepId;
type Icon = ComponentType<{ className?: string; color?: string; size?: number; strokeWidth?: number }>;
type SelectOption = { label: string; value: string };
type ProfileFieldKey = Exclude<keyof BusinessProfile, "businessName">;

const profileFieldKeys: ProfileFieldKey[] = [
  "tagline",
  "overview",
  "uniqueValue",
  "offerSummary",
  "idealCustomer",
  "marketPosition",
  "brandVoice",
  "marketingFocus"
];

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
      addProduct: "إضافة المنتج أو الخدمة",
      attention: "تنبيه",
      aiCardBody: "يتعلم MARKOS علامتك خلال دقائق ويولّد محتوى يشبه صوتك من اليوم الأول.",
      aiCardTitle: "إعداد مدعوم بالذكاء الاصطناعي",
      back: "السابق",
      brand: {
        color: "لون العلامة الأساسي *",
        fonts: "خطوط العلامة (افصل بينها بفواصل)",
        tone: "نبرة صوت العلامة *",
        visualWords: "كلمات تصف الهوية البصرية (افصل بينها بفواصل)",
        voiceNotes: "ملاحظات إضافية عن أسلوب الكتابة",
        title: "حدّد هوية علامتك",
        body: "اختر القيم التي تمثل علامتك فعلاً. يمكنك إضافة الملفات من الخزنة لاحقاً."
      },
      build: "مراجعة الملف",
      company: {
        body: "يساعد هذا MARKOS على إنشاء محتوى يمثل علامتك بدقة.",
        industry: "القطاع *",
        language: "لغات العمل *",
        location: "موقع النشاط *",
        name: "اسم الشركة *",
        title: "حدثنا عن شركتك",
        website: "الموقع الإلكتروني"
      },
      complete: "مكتمل",
      competitors: {
        advantage: "ما ميزتك التنافسية؟",
        body: "تساعد إجاباتك MARKOS على فهم موقع نشاطك في السوق.",
        hint: "يمكنك إضافة المزيد لاحقاً من الإعدادات.",
        difference: "ماذا تريد أن تفعل بشكل مختلف؟",
        title: "من هم منافسوك؟"
      },
      continue: "متابعة",
      dismiss: "إغلاق الإشعار",
      errors: {
        approve: "تعذر اعتماد ملف النشاط الآن.",
        complete: "تعذر إنهاء الإعداد الآن.",
        generate: "تعذر إنشاء ملف النشاط الآن. إجاباتك محفوظة ويمكنك المحاولة مجدداً.",
        save: "تعذر حفظ هذه الخطوة الآن.",
        session: "ما زلنا نتحقق من جلستك. حاول مرة أخرى بعد لحظة."
      },
      goals: {
        body: "اختر كل ما ينطبق. سيضبط MARKOS استراتيجية المحتوى وفقاً لذلك.",
        budget: "نطاق الميزانية الاختياري",
        instagramExperience: "خبرتك الحالية مع إنستغرام",
        success90Days: "كيف يبدو النجاح بعد 90 يوماً؟",
        title: "ما أهدافك من المحتوى؟"
      },
      launch: "إكمال الإعداد",
      profile: {
        approve: "اعتماد الملف والمتابعة",
        back: "مراجعة الإجابات",
        businessName: "اسم النشاط",
        draftBody: "راجع الصياغة وعدّلها حتى تمثل نشاطك كما تريد. سيستخدم MARKOS النسخة التي تعتمدها كذاكرة أساسية.",
        draftEyebrow: "ملف أنشأه MARKOS",
        draftTitle: "هذه هي هوية نشاطك",
        editHint: "كل النصوص قابلة للتعديل. راجع اللغتين قبل الاعتماد.",
        fields: {
          tagline: "الوصف المختصر",
          overview: "نبذة عن النشاط",
          uniqueValue: "القيمة الفريدة",
          offerSummary: "المنتجات والخدمات",
          idealCustomer: "العميل المثالي",
          marketPosition: "الموقع في السوق",
          brandVoice: "صوت العلامة",
          marketingFocus: "التركيز التسويقي"
        },
        generate: "إنشاء ملف نشاطي",
        generateBody: "سيحوّل MARKOS إجاباتك إلى ملف ثنائي اللغة يمكنك مراجعته وتعديله قبل اعتماده.",
        generateTitle: "حوّل معرفتك إلى هوية واضحة",
        generatingBody: "نلخّص قصتك وعروضك وجمهورك وصوت علامتك باللغتين العربية والإنجليزية.",
        generatingTitle: "MARKOS يبني ملف نشاطك",
        languageAr: "العربية",
        languageEn: "English",
        regenerate: "إنشاء صياغة جديدة"
      },
      products: {
        body: "أضف منتجاً أو خدمة واحدة على الأقل حتى يفهم MARKOS ما تبيعه.",
        category: "الفئة",
        description: "وصف مختصر",
        differentiators: "عوامل التميز (افصل بينها بفواصل)",
        empty: "لم تتم إضافة منتجات أو خدمات بعد.",
        name: "اسم المنتج أو الخدمة *",
        priceRange: "نطاق الأسعار الاختياري",
        salesChannels: "قنوات البيع (افصل بينها بفواصل)",
        title: "ماذا تقدم؟"
      },
      progress: (step: StepId, total: number) => `الخطوة ${step} من ${total}`,
      saved: "تم الحفظ في الخزنة",
      status: "تم الحفظ",
      setup: {
        body: "راجِع أن الأقسام السبعة تعكس نشاطك الحقيقي. عند الإكمال سيحفظ MARKOS الملف في خزنة مساحة العمل.",
        readyTitle: "ملف نشاطك جاهز للحفظ"
      },
      story: {
        body: "ساعد MARKOS على فهم سبب وجود نشاطك وما الذي يجعله مختلفاً.",
        mission: "رسالة النشاط *",
        origin: "قصة البداية",
        problemSolved: "المشكلة التي تحلها",
        title: "احكِ قصة نشاطك",
        usp: "عرض القيمة الفريد *",
        values: "قيم النشاط * (افصل بينها بفواصل)",
        vision: "الرؤية"
      },
      steps: [
        { id: 1 as const, label: "معلومات الشركة", desc: "عرّفنا على نشاطك" },
        { id: 2 as const, label: "قصة النشاط", desc: "اشرح رسالتك وقيمك" },
        { id: 3 as const, label: "المنتجات والخدمات", desc: "ماذا تقدم؟" },
        { id: 4 as const, label: "الجمهور المستهدف", desc: "من تخدم؟" },
        { id: 5 as const, label: "المنافسون", desc: "اعرف السوق" },
        { id: 6 as const, label: "هوية العلامة", desc: "حدد صوتك وألوانك" },
        { id: 7 as const, label: "أهداف المحتوى", desc: "حدد أهدافك" },
        { id: 8 as const, label: "المراجعة", desc: "أكمل ملف النشاط" }
      ],
      audience: {
        age: "الفئة العمرية",
        body: "فهم جمهورك يساعد MARKOS على صياغة رسائل مؤثرة.",
        demographics: "صف جمهورك الأساسي *",
        gender: "تركيز الجنس",
        interests: "الاهتمامات * (افصل بينها بفواصل)",
        location: "مواقع الجمهور (افصل بينها بفواصل)",
        motivations: "الدوافع (افصل بينها بفواصل)",
        painPoints: "نقاط ألم العملاء * (افصل بينها بفواصل)",
        title: "من هو جمهورك؟"
      },
      validation: {
        audience: "أضف وصفاً للجمهور واهتماماً واحداً ونقطة ألم واحدة على الأقل.",
        brand: "اختر لوناً أساسياً ونبرة صوت للعلامة.",
        company: "أدخل اسم الشركة والقطاع والموقع ولغة عمل واحدة على الأقل.",
        competitors: "أضف منافساً واحداً على الأقل لإكمال هذا القسم.",
        objectives: "اختر هدف محتوى واحداً على الأقل.",
        products: "أضف منتجاً أو خدمة واحدة على الأقل.",
        story: "أدخل الرسالة وعرض القيمة وقيمة واحدة على الأقل."
      }
    };
  }

  return {
    add: "Add",
    addCompetitorPlaceholder: "Add competitor name...",
    addProduct: "Add product or service",
    attention: "Attention",
    aiCardBody: "MARKOS learns your brand in minutes and generates content that sounds like you from day one.",
    aiCardTitle: "AI-Powered Setup",
    back: "Back",
    brand: {
      color: "Primary Brand Color",
      fonts: "Brand fonts (comma-separated)",
      tone: "Brand Tone of Voice *",
      visualWords: "Visual identity words (comma-separated)",
      voiceNotes: "Additional writing-style notes",
      title: "Define your brand identity",
      body: "Choose values that genuinely represent your brand. You can add files from the Vault later."
    },
    build: "Review profile",
    company: {
      body: "This helps MARKOS create content that truly represents your brand.",
      industry: "Industry *",
      language: "Business languages *",
      location: "Business location *",
      name: "Company Name *",
      title: "Tell us about your company",
      website: "Website"
    },
    complete: "complete",
    competitors: {
      advantage: "What is your competitive advantage?",
      body: "Your answers help MARKOS understand your position in the market.",
      hint: "You can always add more later from Settings.",
      difference: "What do you want to do differently?",
      title: "Who are your competitors?"
    },
    continue: "Continue",
    dismiss: "Dismiss notification",
      errors: {
        approve: "Could not approve the business profile yet.",
        complete: "Could not complete onboarding yet.",
        generate: "Could not create the business profile yet. Your answers are safe, so you can try again.",
        save: "Could not save this step yet.",
        session: "We are still checking your session. Try again in a moment."
      },
    goals: {
      body: "Select all that apply. MARKOS will optimize your content strategy accordingly.",
      budget: "Optional budget range",
      instagramExperience: "Current Instagram experience",
      success90Days: "What would success look like in 90 days?",
      title: "What are your content goals?"
    },
    launch: "Complete onboarding",
    profile: {
      approve: "Approve profile & continue",
      back: "Review my answers",
      businessName: "Business name",
      draftBody: "Review the wording and make it sound exactly like your business. MARKOS will use the approved version as its core memory.",
      draftEyebrow: "Resolved by MARKOS",
      draftTitle: "This is your business identity",
      editHint: "Everything is editable. Review both languages before you approve.",
      fields: {
        tagline: "Short description",
        overview: "Business overview",
        uniqueValue: "Unique value",
        offerSummary: "Products and services",
        idealCustomer: "Ideal customer",
        marketPosition: "Market position",
        brandVoice: "Brand voice",
        marketingFocus: "Marketing focus"
      },
      generate: "Generate my business profile",
      generateBody: "MARKOS will turn your answers into a bilingual profile you can review and edit before anything is finalized.",
      generateTitle: "Turn your knowledge into a clear identity",
      generatingBody: "We are resolving your story, offers, audience, and brand voice in Arabic and English.",
      generatingTitle: "MARKOS is building your profile",
      languageAr: "العربية",
      languageEn: "English",
      regenerate: "Generate a new version"
    },
    products: {
      body: "Add at least one product or service so MARKOS understands what you sell.",
      category: "Category",
      description: "Short description",
      differentiators: "Differentiators (comma-separated)",
      empty: "No products or services added yet.",
      name: "Product or service name *",
      priceRange: "Optional price range",
      salesChannels: "Sales channels (comma-separated)",
      title: "What do you offer?"
    },
    progress: (step: StepId, total: number) => `Step ${step} of ${total}`,
    saved: "Saved to Vault",
    status: "Saved",
    setup: {
      body: "Review that all seven sections describe your real business. Completing onboarding saves the profile to your workspace Vault.",
      readyTitle: "Your business profile is ready to save"
    },
    story: {
      body: "Help MARKOS understand why your business exists and what makes it different.",
      mission: "Business mission *",
      origin: "Origin story",
      problemSolved: "Problem you solve",
      title: "Tell your business story",
      usp: "Unique value proposition *",
      values: "Business values * (comma-separated)",
      vision: "Vision"
    },
    steps: [
      { id: 1 as const, label: "Company Info", desc: "Tell us about your business" },
      { id: 2 as const, label: "Business Story", desc: "Explain your mission and values" },
      { id: 3 as const, label: "Products & Services", desc: "What do you offer?" },
      { id: 4 as const, label: "Target Audience", desc: "Who do you serve?" },
      { id: 5 as const, label: "Competitors", desc: "Know your market" },
      { id: 6 as const, label: "Brand Identity", desc: "Define your voice and colors" },
      { id: 7 as const, label: "Content Goals", desc: "Set your objectives" },
      { id: 8 as const, label: "Review", desc: "Complete the business profile" }
    ],
    audience: {
      age: "Age Range",
      body: "Understanding your audience helps MARKOS craft messages that resonate.",
      demographics: "Describe your primary audience *",
      gender: "Gender Focus",
      interests: "Interests * (comma-separated)",
      location: "Audience locations (comma-separated)",
      motivations: "Motivations (comma-separated)",
      painPoints: "Customer pain points * (comma-separated)",
      title: "Who is your audience?"
    },
    validation: {
      audience: "Add an audience description, at least one interest, and at least one pain point.",
      brand: "Choose a primary brand color and tone of voice.",
      company: "Enter the company name, industry, location, and at least one business language.",
      competitors: "Add at least one competitor to complete this section.",
      objectives: "Choose at least one content goal.",
      products: "Add at least one product or service.",
      story: "Enter a mission, a unique value proposition, and at least one business value."
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

export function OnboardingPanel({ locale }: { locale: Locale }) {
  const copy = onboardingCopy(locale);
  const isRtl = locale === "ar";
  const steps = copy.steps;
  const [draft, setDraft] = useState<OnboardingDraft>(createEmptyOnboardingDraft);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [profileDraft, setProfileDraft] = useState<BusinessProfile | null>(null);
  const [profileInteractionId, setProfileInteractionId] = useState<string | null>(null);
  const [profileLanguage, setProfileLanguage] = useState<Locale>(locale);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const session = useMarkosSession();
  const [step, setStep] = useState<StepId>(1);
  const router = useRouter();
  const workspaceNameApplied = useRef(false);

  const client = useMarkosClient(locale);
  const dismissMessage = useCallback(() => setMessage(""), []);
  const applyBusinessProfileState = useCallback((state: OnboardingBusinessProfileState) => {
    setProfileDraft(state.profile);
    setProfileInteractionId(state.interactionId);
  }, []);

  useEffect(() => {
    window.localStorage.removeItem(legacyOnboardingDraftKey);
    const baseDraft = createEmptyOnboardingDraft();
    const storedDraft = window.localStorage.getItem(onboardingDraftKey);

    if (storedDraft) {
      try {
        const parsed = JSON.parse(storedDraft) as Partial<OnboardingDraft>;
        setDraft({ ...baseDraft, ...parsed });
      } catch {
        window.localStorage.removeItem(onboardingDraftKey);
        setDraft(baseDraft);
      }
    } else {
      setDraft(baseDraft);
    }

    workspaceNameApplied.current = false;
    setProfileDraft(null);
    setProfileInteractionId(null);
    setProfileLanguage(locale);
    setProfileLoaded(false);
    setProfileLoading(false);
    setStep(getInitialStep());
    setDraftHydrated(true);
  }, [locale]);

  useEffect(() => {
    if (session) return;

    void initializeBrowserSession(locale).catch(() => {
      setMessageTone("error");
      setMessage(
        locale === "ar"
          ? "تعذر تجديد الجلسة مؤقتاً. حاول مجدداً بعد التحقق من الاتصال."
          : "Your session could not be renewed temporarily. Check your connection and try again."
      );
    });
  }, [locale, session]);

  useEffect(() => {
    if (step !== 8 || !session || profileLoaded) return;

    let active = true;
    setProfileLoading(true);

    void client
      .onboarding()
      .then((state) => {
        if (!active) return;

        if (state.status === "COMPLETE" && state.businessProfile.status === "APPROVED") {
          router.replace(`/${locale}/app`);
          return;
        }

        applyBusinessProfileState(state.businessProfile);
        setProfileLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        setMessageTone("error");
        setMessage(error instanceof Error ? error.message : copy.errors.generate);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyBusinessProfileState, client, copy.errors.generate, locale, profileLoaded, router, session, step]);

  useEffect(() => {
    if (!draftHydrated) return;
    window.localStorage.setItem(onboardingDraftKey, JSON.stringify(draft));
  }, [draft, draftHydrated]);

  useEffect(() => {
    const workspaceName = session?.workspace.name.trim();
    if (!draftHydrated || !workspaceName || workspaceNameApplied.current) return;

    workspaceNameApplied.current = true;
    setDraft((current) =>
      current.companyName.trim()
        ? current
        : { ...current, companyName: workspaceName },
    );
  }, [draftHydrated, session]);

  const progress = Math.round((step / steps.length) * 100);

  async function next() {
    const saved = await persistStep(step);
    if (!saved) return;

    if (step === 7) {
      setProfileLoaded(true);
      setStep(8);
      await generateProfile();
      return;
    }

    if (step < 8) {
      setStep((current) => (current + 1) as StepId);
    }
  }

  function back() {
    setStep((current) => Math.max(1, current - 1) as StepId);
    setMessage("");
  }

  async function generateProfile() {
    if (!session) {
      setMessageTone("error");
      setMessage(copy.errors.session);
      return;
    }

    setProfileLoading(true);
    setMessage("");
    try {
      const state = await client.generateBusinessProfile();
      applyBusinessProfileState(state.businessProfile);
      setProfileLoaded(true);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : copy.errors.generate);
    } finally {
      setProfileLoading(false);
    }
  }

  async function approveProfile() {
    if (!session) {
      setMessageTone("error");
      setMessage(copy.errors.session);
      return;
    }

    if (!profileDraft || !profileInteractionId) {
      setMessageTone("error");
      setMessage(copy.errors.generate);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await client.approveBusinessProfile({
        interactionId: profileInteractionId,
        profile: profileDraft
      });
      window.localStorage.removeItem(onboardingDraftKey);
      router.push(`/${locale}/app`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : copy.errors.approve);
      setSaving(false);
    }
  }

  function updateBusinessName(value: string) {
    setProfileDraft((current) => (current ? { ...current, businessName: value } : current));
  }

  function updateProfileField(field: ProfileFieldKey, language: Locale, value: string) {
    setProfileDraft((current) =>
      current
        ? {
            ...current,
            [field]: {
              ...current[field],
              [language]: value
            }
          }
        : current
    );
  }

  async function persistStep(stepToSave: StepId): Promise<boolean> {
    if (!session) {
      setMessageTone("error");
      setMessage(copy.errors.session);
      return false;
    }

    const validationIssue = validateOnboardingStep(stepToSave, draft);
    if (validationIssue) {
      setMessageTone("error");
      setMessage(copy.validation[validationIssue]);
      return false;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = payloadForOnboardingStep(stepToSave, draft);
      if (!payload) return false;
      await client.saveOnboardingModule(payload.module, payload.body);
      setMessageTone("success");
      setMessage(copy.saved);
      return true;
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : copy.errors.save);
      return false;
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

  function addProduct() {
    if (!draft.newProduct.name.trim()) {
      setMessageTone("error");
      setMessage(copy.validation.products);
      return;
    }

    const product: OnboardingProductDraft = {
      category: draft.newProduct.category.trim(),
      description: draft.newProduct.description.trim(),
      name: draft.newProduct.name.trim()
    };
    setDraft((current) => ({
      ...current,
      newProduct: { category: "", description: "", name: "" },
      products: [...current.products, product]
    }));
    setMessage("");
  }

  function removeProduct(index: number) {
    setDraft((current) => ({
      ...current,
      products: current.products.filter((_, itemIndex) => itemIndex !== index)
    }));
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
      <NotificationToast
        body={message}
        dismissLabel={copy.dismiss}
        onDismiss={dismissMessage}
        title={messageTone === "error" ? copy.attention : copy.status}
        tone={messageTone}
      />
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
        <div className={step === 8 ? "w-full min-w-0 max-w-[310px] sm:max-w-[920px]" : "w-full min-w-0 max-w-[310px] sm:max-w-[560px]"}>
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
            {step === 2 ? <StoryStep copy={copy} draft={draft} update={update} /> : null}
            {step === 3 ? <ProductsStep addProduct={addProduct} copy={copy} draft={draft} removeProduct={removeProduct} update={update} /> : null}
            {step === 4 ? <AudienceStep copy={copy} draft={draft} locale={locale} update={update} /> : null}
            {step === 5 ? <CompetitorsStep addCompetitor={addCompetitor} copy={copy} draft={draft} removeCompetitor={removeCompetitor} update={update} /> : null}
            {step === 6 ? <BrandStep copy={copy} draft={draft} locale={locale} update={update} /> : null}
            {step === 7 ? <GoalsStep copy={copy} draft={draft} locale={locale} toggleGoal={toggleGoal} update={update} /> : null}
            {step === 8 ? (
              <ReviewStep
                approveProfile={approveProfile}
                back={back}
                copy={copy}
                generateProfile={generateProfile}
                language={profileLanguage}
                loading={profileLoading}
                profile={profileDraft}
                saving={saving}
                setLanguage={setProfileLanguage}
                updateBusinessName={updateBusinessName}
                updateProfileField={updateProfileField}
              />
            ) : null}

            {step < 8 ? (
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
                  {step === 7 ? copy.build : copy.continue}
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
        <DarkSelect label={copy.company.industry} onChange={(value) => update("industry", value)} options={industryOptions(locale)} placeholder={copy.company.industry} value={draft.industry} />
        <DarkField label={copy.company.location} onChange={(value) => update("location", value)} value={draft.location} />
        <DarkField label={copy.company.website} onChange={(value) => update("website", value)} value={draft.website} />
        <section>
          <Label>{copy.company.language}</Label>
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
    </div>
  );
}

function StoryStep({ copy, draft, update }: StepProps & { copy: OnboardingCopy }) {
  return (
    <div>
      <StepHeading body={copy.story.body} title={copy.story.title} />
      <div className="grid gap-4">
        <DarkField area label={copy.story.mission} onChange={(value) => update("mission", value)} value={draft.mission} />
        <DarkField area label={copy.story.usp} onChange={(value) => update("usp", value)} value={draft.usp} />
        <DarkField label={copy.story.values} onChange={(value) => update("values", value)} value={draft.values} />
        <DarkField area label={copy.story.origin} onChange={(value) => update("origin", value)} value={draft.origin} />
        <DarkField area label={copy.story.problemSolved} onChange={(value) => update("problemSolved", value)} value={draft.problemSolved} />
        <DarkField area label={copy.story.vision} onChange={(value) => update("vision", value)} value={draft.vision} />
      </div>
    </div>
  );
}

function ProductsStep({
  addProduct,
  copy,
  draft,
  removeProduct,
  update
}: StepProps & {
  addProduct: () => void;
  copy: OnboardingCopy;
  removeProduct: (index: number) => void;
}) {
  function updateNewProduct(key: keyof OnboardingProductDraft, value: string) {
    update("newProduct", { ...draft.newProduct, [key]: value });
  }

  return (
    <div>
      <StepHeading body={copy.products.body} title={copy.products.title} />
      <div className="grid gap-3">
        {draft.products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-white/[.03] p-4 text-sm text-white/45">
            {copy.products.empty}
          </p>
        ) : null}
        {draft.products.map((product, index) => (
          <article className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.07] p-4" key={`${product.name}-${index}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{product.name}</p>
              {product.category ? <p className="mt-1 text-xs text-white/45">{product.category}</p> : null}
              {product.description ? <p className="mt-2 text-sm leading-6 text-white/60">{product.description}</p> : null}
            </div>
            <button aria-label={`Remove ${product.name}`} className="text-white/40 transition hover:text-accent" onClick={() => removeProduct(index)} type="button">
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4">
        <DarkField label={copy.products.name} onChange={(value) => updateNewProduct("name", value)} value={draft.newProduct.name} />
        <DarkField label={copy.products.category} onChange={(value) => updateNewProduct("category", value)} value={draft.newProduct.category} />
        <DarkField area label={copy.products.description} onChange={(value) => updateNewProduct("description", value)} value={draft.newProduct.description} />
        <button className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white" onClick={addProduct} type="button">
          <Plus size={16} />
          {copy.addProduct}
        </button>
      </div>
      <div className="mt-4 grid gap-4">
        <DarkField label={copy.products.differentiators} onChange={(value) => update("differentiators", value)} value={draft.differentiators} />
        <DarkField label={copy.products.priceRange} onChange={(value) => update("priceRange", value)} value={draft.priceRange} />
        <DarkField label={copy.products.salesChannels} onChange={(value) => update("salesChannels", value)} value={draft.salesChannels} />
      </div>
    </div>
  );
}

function BrandStep({ copy, draft, locale, update }: StepProps & { copy: OnboardingCopy; locale: Locale }) {
  return (
    <div>
      <StepHeading body={copy.brand.body} title={copy.brand.title} />
      <section>
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
      <div className="mt-5 grid gap-4 sm:mt-6">
        <DarkField label={copy.brand.visualWords} onChange={(value) => update("brandVisualWords", value)} value={draft.brandVisualWords} />
        <DarkField label={copy.brand.fonts} onChange={(value) => update("brandFonts", value)} value={draft.brandFonts} />
        <DarkField area label={copy.brand.voiceNotes} onChange={(value) => update("brandVoiceNotes", value)} value={draft.brandVoiceNotes} />
      </div>
    </div>
  );
}

function AudienceStep({ copy, draft, locale, update }: StepProps & { copy: OnboardingCopy; locale: Locale }) {
  return (
    <div>
      <StepHeading body={copy.audience.body} title={copy.audience.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DarkSelect label={copy.audience.age} onChange={(value) => update("ageRange", value)} options={["18-24", "25-34", "35-44", "45+"].map((value) => ({ label: value, value }))} placeholder={copy.audience.age} value={draft.ageRange} />
        <DarkSelect label={copy.audience.gender} onChange={(value) => update("genderFocus", value)} options={genderOptions(locale)} placeholder={copy.audience.gender} value={draft.genderFocus} />
        <div className="sm:col-span-2">
          <DarkField area label={copy.audience.demographics} onChange={(value) => update("audienceDescription", value)} value={draft.audienceDescription} />
        </div>
        <div className="sm:col-span-2">
          <DarkField area label={copy.audience.painPoints} onChange={(value) => update("painPoints", value)} value={draft.painPoints} />
        </div>
        <div className="sm:col-span-2">
          <DarkField label={copy.audience.interests} onChange={(value) => update("interests", value)} value={draft.interests} />
        </div>
        <DarkField label={copy.audience.location} onChange={(value) => update("audienceLocations", value)} value={draft.audienceLocations} />
        <DarkField label={copy.audience.motivations} onChange={(value) => update("motivations", value)} value={draft.motivations} />
      </div>
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
      <div className="mt-5 grid gap-4">
        <DarkField area label={copy.competitors.advantage} onChange={(value) => update("competitiveAdvantage", value)} value={draft.competitiveAdvantage} />
        <DarkField area label={copy.competitors.difference} onChange={(value) => update("competitorDifference", value)} value={draft.competitorDifference} />
      </div>
    </div>
  );
}

function GoalsStep({ copy, draft, locale, toggleGoal, update }: StepProps & { copy: OnboardingCopy; locale: Locale; toggleGoal: (goal: string) => void }) {
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
      <div className="mt-5 grid gap-4">
        <DarkField label={copy.goals.budget} onChange={(value) => update("budgetRange", value)} value={draft.budgetRange} />
        <DarkField label={copy.goals.instagramExperience} onChange={(value) => update("instagramExperience", value)} value={draft.instagramExperience} />
        <DarkField area label={copy.goals.success90Days} onChange={(value) => update("success90Days", value)} value={draft.success90Days} />
      </div>
    </div>
  );
}

function ReviewStep({
  approveProfile,
  back,
  copy,
  generateProfile,
  language,
  loading,
  profile,
  saving,
  setLanguage,
  updateBusinessName,
  updateProfileField
}: {
  approveProfile: () => void;
  back: () => void;
  copy: OnboardingCopy;
  generateProfile: () => void;
  language: Locale;
  loading: boolean;
  profile: BusinessProfile | null;
  saving: boolean;
  setLanguage: (language: Locale) => void;
  updateBusinessName: (value: string) => void;
  updateProfileField: (field: ProfileFieldKey, language: Locale, value: string) => void;
}) {
  if (loading) {
    return (
      <div className="py-8 text-center sm:py-14">
        <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
          <span className="absolute inset-2 animate-pulse rounded-3xl border border-accent/30 bg-accent/10" />
          <LoaderCircle className="relative animate-spin text-accent" size={38} strokeWidth={1.8} />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-normal text-white sm:text-3xl">
          {copy.profile.generatingTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/55 sm:text-base">
          {copy.profile.generatingBody}
        </p>
        <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
          {[copy.story.title, copy.audience.title, copy.brand.title].map((label, index) => (
            <div className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3" key={label}>
              <span className="mb-2 block h-1 rounded-full bg-white/10">
                <span
                  className="block h-full animate-pulse rounded-full bg-accent"
                  style={{ animationDelay: `${index * 180}ms`, width: `${70 + index * 10}%` }}
                />
              </span>
              <span className="text-xs text-white/45">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-5 text-center sm:px-8 sm:py-12">
        <BrandAiMark />
        <StepHeading center body={copy.profile.generateBody} title={copy.profile.generateTitle} />
        <button
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-6 py-3.5 text-base font-bold text-white shadow-[0_4px_20px_rgba(233,69,96,.4)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(233,69,96,.35)]"
          onClick={generateProfile}
          type="button"
        >
          <WandSparkles size={19} />
          {copy.profile.generate}
        </button>
        <button className="mt-5 text-sm text-white/45 transition hover:text-white/70" onClick={back} type="button">
          {copy.profile.back}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-accent">
            <Sparkles size={13} />
            {copy.profile.draftEyebrow}
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-normal text-white sm:text-3xl">
            {copy.profile.draftTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">{copy.profile.draftBody}</p>
        </div>
        <div className="inline-flex shrink-0 rounded-xl border border-white/10 bg-black/15 p-1" aria-label="Profile language">
          <button
            className={language === "en" ? "rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white shadow-sm" : "rounded-lg px-4 py-2 text-xs font-semibold text-white/40"}
            onClick={() => setLanguage("en")}
            type="button"
          >
            {copy.profile.languageEn}
          </button>
          <button
            className={language === "ar" ? "rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white shadow-sm" : "rounded-lg px-4 py-2 text-xs font-semibold text-white/40"}
            onClick={() => setLanguage("ar")}
            type="button"
          >
            {copy.profile.languageAr}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] p-4">
        <label>
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-cyan-200/70">
            <BriefcaseBusiness size={14} />
            {copy.profile.businessName}
          </span>
          <input
            className="mt-2 w-full bg-transparent font-display text-xl font-bold text-white outline-none placeholder:text-white/25"
            dir="auto"
            onChange={(event) => updateBusinessName(event.target.value)}
            value={profile.businessName}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {profileFieldKeys.map((field, index) => (
          <label
            className={index === 1 ? "rounded-xl border border-white/10 bg-white/[.04] p-4 sm:col-span-2" : "rounded-xl border border-white/10 bg-white/[.04] p-4"}
            key={field}
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.07em] text-white/50">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[.06] text-[10px] text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              {copy.profile.fields[field]}
            </span>
            <textarea
              className="mt-3 min-h-24 w-full resize-y bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/20"
              dir={language === "ar" ? "rtl" : "ltr"}
              onChange={(event) => updateProfileField(field, language, event.target.value)}
              value={profile[field][language]}
            />
          </label>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[.05] p-4 text-start">
        <Languages className="mt-0.5 shrink-0 text-amber-300" size={18} />
        <p className="text-xs leading-5 text-white/50">{copy.profile.editHint}</p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm font-semibold text-white/55 transition hover:bg-white/[.08] hover:text-white"
            disabled={saving}
            onClick={back}
            type="button"
          >
            {copy.profile.back}
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-accent/30 hover:text-accent disabled:opacity-50"
            disabled={saving}
            onClick={generateProfile}
            type="button"
          >
            <RefreshCw size={15} />
            {copy.profile.regenerate}
          </button>
        </div>
        <button
          className="flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-6 py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_rgba(233,69,96,.32)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
          disabled={saving}
          onClick={approveProfile}
          type="button"
        >
          {saving ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
          {copy.profile.approve}
        </button>
      </div>
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

function BrandAiMark() {
  return (
    <div className="mb-6 flex justify-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-accent/40 bg-[linear-gradient(135deg,rgba(233,69,96,.3),rgba(15,52,96,.3))]">
        <Sparkles className="text-accent" size={32} />
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
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string;
}) {
  return (
    <label>
      <Label>{label}</Label>
      <select className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#2d2d42] px-4 py-3 text-[15px] text-white outline-none focus:border-accent" onChange={(event) => onChange(event.target.value)} value={value}>
        <option disabled value="">
          {placeholder}
        </option>
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

function getInitialStep(): StepId {
  if (typeof window === "undefined") return 1;
  const value = Number(new URLSearchParams(window.location.search).get("step") ?? "1");
  return value >= 1 && value <= 8 ? (value as StepId) : 1;
}
