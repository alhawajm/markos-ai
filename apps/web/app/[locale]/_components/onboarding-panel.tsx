"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Compass,
  FileText,
  Info,
  Languages,
  Layers3,
  LoaderCircle,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Users,
  WandSparkles,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent, type ReactNode } from "react";
import type { BusinessProfile, Locale, OfferingCatalogUpdate, OfferingDocumentAnalysisRecord, OnboardingState } from "@markos/shared-types";
import { initializeBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import { canRetryOfferingDocumentFailure, offeringDocumentFailureMessage } from "./offering-document-errors";
import {
  createEmptyOnboardingDraft,
  hasOnboardingStepData,
  legacyOnboardingDraftKey,
  onboardingStepHasChanges,
  onboardingDraftKey,
  payloadForOnboardingStep,
  previousOnboardingDraftKey,
  restoreOnboardingStep,
  splitOnboardingList,
  validateOnboardingStep,
  type OnboardingDraft,
  type OnboardingStepId
} from "./onboarding-draft";

type Screen = "greeting" | "profile" | "review" | "step";
type ProfileFieldKey = Exclude<keyof BusinessProfile, "businessName">;
type DraftFieldKey = keyof OnboardingDraft;
type Icon = ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;

interface FieldDefinition {
  area?: boolean;
  full?: boolean;
  helper?: string;
  key: DraftFieldKey;
  label: string;
  maxLength?: number;
  placeholder: string;
  recommended?: boolean;
}

interface StepDefinition {
  description: string;
  fields: FieldDefinition[];
  help: string;
  icon: Icon;
  id: OnboardingStepId;
  label: string;
  module: string;
  skippable: boolean;
  suggestions?: string[];
  suggestionMode?: "multi" | "single";
  suggestionTarget?: DraftFieldKey;
  title: string;
  intro: string;
}

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

const moduleOrder = ["company", "story", "products", "audience", "competitors", "brand", "objectives"];

function onboardingCopy(locale: Locale) {
  if (locale === "ar") {
    return {
      attention: "تنبيه",
      back: "السابق",
      backGuard: {
        description: "لديك تغييرات لم تُحفظ في هذه الخطوة. يمكنك تجاهلها والعودة، أو متابعة التعديل.",
        discard: "تجاهل التغييرات",
        eyebrow: "تغييرات غير محفوظة",
        keep: "متابعة التعديل",
        title: "هل تريد مغادرة هذه الخطوة؟"
      },
      dismiss: "إغلاق الإشعار",
      edit: "تعديل",
      essential: "أساسي",
      errors: {
        approve: "تعذر اعتماد ملف النشاط الآن.",
        company: "أدخل اسم النشاط بحرفين على الأقل.",
        generate: "تعذر إنشاء ملف النشاط الآن. إجاباتك محفوظة ويمكنك المحاولة مجدداً.",
        products: "صف منتجاً أو خدمة واحدة على الأقل.",
        save: "تعذر حفظ هذه الخطوة الآن.",
        session: "ما زلنا نتحقق من جلستك. حاول مرة أخرى بعد لحظة.",
        tone: "استخدم أربع كلمات أو أقل لوصف نبرة الصوت."
      },
      documents: {
        add: "إضافة منتج أو خدمة",
        analyze: "تحليل المستندات",
        analyzing: "يحلل MARKOS المستندات…",
        body: "ارفع ملفاً أو ملفين، وسنستخرج ما تقدمه لتراجعه قبل الحفظ. يمكنك دائماً استخدام الحقل اليدوي أعلاه.",
        choose: "اختر PDF أو Word أو TXT",
        discard: "حذف التحليل",
        duplicate: "يجب أن يكون لكل منتج أو خدمة اسم مختلف.",
        expires: "تحذف الملفات الأصلية بعد الاعتماد أو خلال 24 ساعة كحد أقصى.",
        failed: "تعذر تحليل هذه الملفات. يمكنك المحاولة مجدداً أو حذفها ورفع ملفات أخرى.",
        invalid: "اختر ملفاً أو ملفين من نوع PDF أو DOCX أو TXT، بحد أقصى 8 ميجابايت للملف و12 ميجابايت إجمالاً.",
        itemDescription: "الوصف",
        itemName: "الاسم",
        issue: (code: string, fallback: string) =>
          ({
            NO_OFFERINGS_FOUND: "لم نجد قائمة واضحة للمنتجات أو الخدمات. راجع الملخص أو أضفها يدوياً.",
            AMBIGUOUS_OFFERING: "بعض العناصر غير واضحة وتحتاج إلى تأكيدك.",
            MISSING_DESCRIPTION: "بعض العناصر لا تحتوي وصفاً.",
            MISSING_PRICE: "لم نجد سعراً مؤكداً لبعض العناصر.",
            CONFLICTING_INFORMATION: "توجد معلومات متعارضة في الملفات وتحتاج إلى مراجعتك.",
            POSSIBLE_NON_OFFERING: "قد لا يكون أحد العناصر منتجاً أو خدمة فعلية.",
            REVIEW_REQUIRED: "راجع التفاصيل المستخرجة قبل اعتمادها.",
            SOURCE_TRUNCATED: "تم اختصار جزء من النص لحدود التحليل الآمن."
          })[code] ?? fallback,
        kind: "النوع",
        kindProduct: "منتج",
        kindService: "خدمة",
        kindUnknown: "غير محدد",
        optional: "اختصار اختياري",
        remove: "إزالة",
        retry: "إعادة المحاولة",
        reviewBody: "صحح الأسماء والأوصاف، واحذف أي عنصر غير صحيح. لن يستخدم MARKOS شيئاً قبل اعتمادك.",
        reviewTitle: "راجع ما وجدناه",
        summary: "ملخص ما تقدمه",
        title: "هل لديك قائمة جاهزة؟",
        use: "اعتماد هذه التفاصيل"
      },
      greeting: {
        eyebrow: "مرحباً بك في MARKOS",
        start: "ابدأ إعداد نشاطي",
        title: "يبدأ تسويقك بفهم نشاطك.",
        journey: ["شارك ما تعرفه", "ينظم MARKOS المعلومات", "راجع قبل الاستخدام"]
      },
      helpTitle: "لماذا نطلب هذا؟",
      informationCheck: "فحص المعلومات",
      next: "التالي",
      notAdded: "غير مضاف",
      optional: "اختياري",
      previous: "السابق",
      profile: {
        approve: "اعتماد الملف والمتابعة",
        back: "العودة إلى فحص المعلومات",
        body: "راجع الصياغة وعدّلها حتى تمثل نشاطك كما تريد. سيستخدم MARKOS النسخة التي تعتمدها كذاكرة أساسية.",
        businessName: "اسم النشاط",
        editHint: "راجع النصين العربي والإنجليزي قبل الاعتماد. يمكنك تعديل كل حقل.",
        eyebrow: "ملف أعدّه MARKOS",
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
        generatingBody: "نحوّل المعلومات المؤكدة إلى ملف نشاط يمكنك مراجعته باللغتين.",
        generatingTitle: "MARKOS يبني ملف نشاطك",
        regenerate: "إنشاء صياغة جديدة",
        title: "راجع ملف نشاطك"
      },
      recommended: "موصى به",
      review: {
        body: "يكفي اسم النشاط وما يقدمه لإنشاء ملف أولي. ستجعل التفاصيل الإضافية اقتراحات MARKOS الأولى أكثر دقة.",
        create: "إنشاء ملف نشاطي",
        missingEssential: "أضف الأساسيات أولاً",
        ready: "جاهز",
        rows: [
          ["اسم النشاط", "أساسي"],
          ["المنتجات والخدمات", "أساسي"],
          ["العملاء", "يساعد على تخصيص النتائج"],
          ["القصة ونقاط القوة", "يحسّن الموقع التسويقي"],
          ["سياق السوق", "اختياري"],
          ["نبرة الصوت", "حتى أربع كلمات"],
          ["الأولوية الحالية", "تؤكدها الاستراتيجية لاحقاً"]
        ],
        title: "راجع ما سيعرفه MARKOS"
      },
      saveContinue: "حفظ ومتابعة",
      skip: "تخطي الآن",
      step: (current: number, total: number) => `الخطوة ${current} من ${total}`,
      suggestions: "اقتراحات",
      steps: arabicSteps()
    };
  }

  return {
    attention: "Attention",
    back: "Back",
    backGuard: {
      description: "You have unsaved changes in this step. Discard them to go back, or keep editing.",
      discard: "Discard changes",
      eyebrow: "Unsaved changes",
      keep: "Keep editing",
      title: "Leave this step?"
    },
    dismiss: "Dismiss notification",
    edit: "Edit",
    essential: "Essential",
    errors: {
      approve: "Could not approve the business profile yet.",
      company: "Add a business name with at least two characters.",
      generate: "Could not create the business profile yet. Your answers are saved, so you can try again.",
      products: "Describe at least one product or service.",
      save: "Could not save this step yet.",
      session: "We are still checking your session. Try again in a moment.",
      tone: "Use no more than four words to describe the tone."
    },
    documents: {
      add: "Add an offering",
      analyze: "Analyze documents",
      analyzing: "MARKOS is analyzing the documents…",
      body: "Upload one or two files and review what we find before anything is saved. The manual field above always remains available.",
      choose: "Choose PDF, Word, or TXT",
      discard: "Discard analysis",
      duplicate: "Every product or service needs a different name.",
      expires: "Original files are deleted after approval or within 24 hours at the latest.",
      failed: "These files could not be analyzed. Retry, or discard them and upload different files.",
      invalid: "Choose one or two PDF, DOCX, or TXT files, up to 8 MB each and 12 MB combined.",
      itemDescription: "Description",
      itemName: "Name",
      issue: (_code: string, fallback: string) => fallback,
      kind: "Type",
      kindProduct: "Product",
      kindService: "Service",
      kindUnknown: "Unspecified",
      optional: "Optional shortcut",
      remove: "Remove",
      retry: "Retry",
      reviewBody: "Correct names and descriptions, and remove anything that is not an offering. MARKOS will not use it until you approve.",
      reviewTitle: "Review what we found",
      summary: "Offer summary",
      title: "Already have a product list?",
      use: "Use these details"
    },
    greeting: {
      eyebrow: "Welcome to MARKOS",
      start: "Set up my business",
      title: "Your marketing starts with understanding your business.",
      journey: ["Share what you know", "MARKOS organizes it", "Review before it is used"]
    },
    helpTitle: "Why this helps",
    informationCheck: "Information check",
    next: "Next",
    notAdded: "Not added",
    optional: "Optional",
    previous: "Previous",
    profile: {
      approve: "Approve profile & continue",
      back: "Back to information check",
      body: "Review the wording and edit anything that does not represent your business. MARKOS will use the approved version as its working memory.",
      businessName: "Business name",
      editHint: "Review both Arabic and English before approval. Every field can be edited.",
      eyebrow: "Prepared by MARKOS",
      fields: {
        tagline: "Tagline",
        overview: "Business overview",
        uniqueValue: "Unique value",
        offerSummary: "Products and services",
        idealCustomer: "Ideal customer",
        marketPosition: "Market position",
        brandVoice: "Brand voice",
        marketingFocus: "Marketing focus"
      },
      generatingBody: "Turning your confirmed information into a bilingual profile you can review.",
      generatingTitle: "MARKOS is building your profile",
      regenerate: "Generate new wording",
      title: "Review your business profile"
    },
    recommended: "Recommended",
    review: {
      body: "Your business name and what you offer are enough for a starting profile. More detail will make MARKOS’s first suggestions more specific.",
      create: "Create my business profile",
      missingEssential: "Add the essentials first",
      ready: "Ready",
      rows: [
        ["Business name", "Essential"],
        ["Products and services", "Essential"],
        ["Customers", "Helps personalize results"],
        ["Story and strengths", "Improves positioning"],
        ["Market context", "Optional"],
        ["Tone of voice", "Up to four words"],
        ["Current priority", "Strategy confirms it later"]
      ],
      title: "Review what MARKOS will know"
    },
    saveContinue: "Save & continue",
    skip: "Skip for now",
    step: (current: number, total: number) => `Step ${current} of ${total}`,
    suggestions: "Suggestions",
    steps: englishSteps()
  };
}

function englishSteps(): StepDefinition[] {
  return [
    {
      id: 1,
      module: "company",
      label: "Business basics",
      description: "Name and main market",
      title: "Let’s start with the basics",
      intro: "Confirm the identity MARKOS should use. Keep this factual and short.",
      help: "The business name grounds your profile. Business type and market help Strategy avoid generic or geographically irrelevant suggestions.",
      icon: Building2,
      skippable: false,
      fields: [
        { key: "businessName", label: "Business name", placeholder: "Example: Sunlit Bakery", maxLength: 160 },
        { key: "industry", label: "Business type", placeholder: "Example: Bakery, salon, consulting studio", recommended: true, maxLength: 120 },
        { key: "market", label: "Main market", placeholder: "Example: Bahrain, GCC, or online worldwide", recommended: true, maxLength: 120 }
      ]
    },
    {
      id: 2,
      module: "story",
      label: "What makes you different",
      description: "Story and strengths",
      title: "Why should customers choose you?",
      intro: "A rough answer is useful. It does not need to sound like marketing copy.",
      help: "A differentiator and the problem you solve improve positioning, profile resolution, and Strategy rationale.",
      icon: Sparkles,
      skippable: true,
      fields: [
        {
          key: "difference",
          label: "What makes you different?",
          placeholder: "Write it in your own words. One or two sentences is enough.",
          area: true,
          full: true,
          recommended: true,
          maxLength: 1000
        },
        { key: "problem", label: "Customer problem", placeholder: "What problem do you help customers solve?", area: true, maxLength: 1000 },
        { key: "story", label: "Story, mission, or values", placeholder: "Add only what already exists", area: true, maxLength: 2000 }
      ]
    },
    {
      id: 3,
      module: "products",
      label: "What you offer",
      description: "Products or services",
      title: "What do you sell or provide?",
      intro: "Use one open field for everything you offer. Names, descriptions, and prices can all live together.",
      help: "This is the minimum grounding MARKOS needs to describe the business and create relevant Strategy and content.",
      icon: Layers3,
      skippable: false,
      fields: [
        {
          key: "offer",
          label: "Products and services",
          placeholder: "Names, descriptions, prices, or any other useful details — write as much or as little as you know.",
          area: true,
          full: true,
          maxLength: 4000
        }
      ]
    },
    {
      id: 4,
      module: "audience",
      label: "Your customers",
      description: "Who you want to reach",
      title: "Who usually buys from you?",
      intro: "Describe real customers in everyday language. Exact demographics are unnecessary unless they genuinely affect the work.",
      help: "Customer context helps Strategy and Create choose more relevant messages, needs, and calls to action.",
      icon: Users,
      skippable: true,
      fields: [
        {
          key: "audience",
          label: "Main customers",
          placeholder: "Example: Busy parents in Bahrain ordering cakes for family celebrations.",
          area: true,
          full: true,
          recommended: true,
          maxLength: 1000
        },
        { key: "needs", label: "Customer needs", placeholder: "What do they need or struggle with?", area: true, maxLength: 1000 },
        { key: "motivations", label: "What matters to them?", placeholder: "Example: reliability, delivery speed, personalization", maxLength: 1000 }
      ]
    },
    {
      id: 5,
      module: "competitors",
      label: "Market context",
      description: "Completely optional",
      title: "Who do customers compare you with?",
      intro: "Skip this if you do not know. A named competitor is not required, and MARKOS will not pretend to verify one.",
      help: "Confirmed comparisons can improve positioning. MARKOS stores only the market observations you provide.",
      icon: Compass,
      skippable: true,
      fields: [
        { key: "competitors", label: "Competitors or alternatives", placeholder: "Optional — leave blank if you do not know", area: true, maxLength: 2000 },
        { key: "avoid", label: "What to avoid", placeholder: "Anything MARKOS should avoid copying?", area: true, maxLength: 1000 }
      ]
    },
    {
      id: 6,
      module: "brand",
      label: "How you sound",
      description: "Tone used by Create",
      title: "How should the business sound?",
      intro: "Describe the voice in up to four tone words. Use a suggestion, combine a few, or write your own.",
      help: "Tone words and writing guidance are used directly to keep AI-generated content consistent.",
      icon: MessageCircleMore,
      skippable: true,
      suggestions: ["Warm", "Clear", "Confident", "Playful", "Professional", "Direct", "Educational", "Premium"],
      suggestionTarget: "toneWords",
      suggestionMode: "multi",
      fields: [
        {
          key: "toneWords",
          label: "Tone of voice",
          placeholder: "Example: warm, clear, confident",
          helper: "Separate words with commas. Suggestions can be removed.",
          recommended: true,
          maxLength: 320
        },
        { key: "voice", label: "Writing guidance", placeholder: "Example: clear and warm; avoid slang and exaggerated promises", area: true, maxLength: 1000 }
      ]
    },
    {
      id: 7,
      module: "objectives",
      label: "Current priority",
      description: "Strategy confirms it later",
      title: "What should MARKOS help with first?",
      intro: "This gives the profile useful context. Strategy will still ask you to confirm or change the objective and duration.",
      help: "A current priority can guide the profile’s marketing focus without locking the future Strategy plan.",
      icon: Target,
      skippable: true,
      suggestions: ["Build awareness", "Generate leads", "Increase sales", "Promote an offer", "Build community", "Launch something new"],
      suggestionTarget: "priority",
      suggestionMode: "single",
      fields: [
        {
          key: "priority",
          label: "Current priority",
          placeholder: "Example: Introduce our new catering service to offices in Manama.",
          area: true,
          maxLength: 1000
        }
      ]
    }
  ];
}

function arabicSteps(): StepDefinition[] {
  const steps = englishSteps();
  return [
    {
      ...steps[0]!,
      label: "أساسيات النشاط",
      description: "الاسم والسوق الرئيسي",
      title: "لنبدأ بالأساسيات",
      intro: "أكد الهوية التي ينبغي أن يستخدمها MARKOS. اجعل المعلومات واقعية ومختصرة.",
      help: "يؤسس اسم النشاط للملف. ويساعد نوع النشاط والسوق الاستراتيجية على تجنب الاقتراحات العامة أو غير الملائمة جغرافياً.",
      fields: [
        { key: "businessName", label: "اسم النشاط", placeholder: "مثال: مخبز صن لايت", maxLength: 160 },
        { key: "industry", label: "نوع النشاط", placeholder: "مثال: مخبز، صالون، استشارات", recommended: true, maxLength: 120 },
        { key: "market", label: "السوق الرئيسي", placeholder: "مثال: البحرين، الخليج، أو عبر الإنترنت عالمياً", recommended: true, maxLength: 120 }
      ]
    },
    {
      ...steps[1]!,
      label: "ما الذي يميزك؟",
      description: "القصة ونقاط القوة",
      title: "لماذا يختارك العملاء؟",
      intro: "تكفي إجابة أولية، ولا يلزم أن تبدو كنص تسويقي.",
      help: "يساعد عامل التميز والمشكلة التي تحلها على تحسين الموقع التسويقي وملف النشاط ومبررات الاستراتيجية.",
      fields: [
        {
          key: "difference",
          label: "ما الذي يميزك؟",
          placeholder: "اكتبها بطريقتك. تكفي جملة أو جملتان.",
          area: true,
          full: true,
          recommended: true,
          maxLength: 1000
        },
        { key: "problem", label: "مشكلة العميل", placeholder: "ما المشكلة التي تساعد العملاء على حلها؟", area: true, maxLength: 1000 },
        { key: "story", label: "القصة أو الرسالة أو القيم", placeholder: "أضف ما هو موجود فعلاً فقط", area: true, maxLength: 2000 }
      ]
    },
    {
      ...steps[2]!,
      label: "ما الذي تقدمه؟",
      description: "المنتجات أو الخدمات",
      title: "ماذا تبيع أو تقدم؟",
      intro: "استخدم حقلاً مفتوحاً واحداً لكل ما تقدمه. يمكن جمع الأسماء والأوصاف والأسعار فيه.",
      help: "هذه أقل معرفة يحتاجها MARKOS لوصف النشاط وإنشاء استراتيجية ومحتوى مرتبطين به.",
      fields: [
        {
          key: "offer",
          label: "المنتجات والخدمات",
          placeholder: "الأسماء أو الأوصاف أو الأسعار أو أي تفاصيل مفيدة — اكتب قدر ما تعرفه.",
          area: true,
          full: true,
          maxLength: 4000
        }
      ]
    },
    {
      ...steps[3]!,
      label: "عملاؤك",
      description: "من تريد الوصول إليه؟",
      title: "من يشتري منك عادة؟",
      intro: "صف العملاء الحقيقيين بلغة يومية. لا حاجة إلى تفاصيل ديموغرافية دقيقة إلا إذا أثرت فعلاً على العمل.",
      help: "يساعد سياق العملاء الاستراتيجية والإنشاء على اختيار رسائل واحتياجات ودعوات إلى الإجراء أكثر ملاءمة.",
      fields: [
        {
          key: "audience",
          label: "العملاء الرئيسيون",
          placeholder: "مثال: أهالٍ مشغولون في البحرين يطلبون كعكات للمناسبات العائلية.",
          area: true,
          full: true,
          recommended: true,
          maxLength: 1000
        },
        { key: "needs", label: "احتياجات العملاء", placeholder: "ماذا يحتاجون أو ما الصعوبات التي يواجهونها؟", area: true, maxLength: 1000 },
        { key: "motivations", label: "ما الذي يهمهم؟", placeholder: "مثال: الموثوقية وسرعة التوصيل والتخصيص", maxLength: 1000 }
      ]
    },
    {
      ...steps[4]!,
      label: "سياق السوق",
      description: "اختياري بالكامل",
      title: "بمن يقارنك العملاء؟",
      intro: "تخط هذه الخطوة إن لم تكن متأكداً. لا يشترط منافس محدد، ولن يدّعي MARKOS التحقق منه.",
      help: "قد تحسن المقارنات المؤكدة الموقع التسويقي. لا يحفظ MARKOS إلا ملاحظات السوق التي تقدمها.",
      fields: [
        { key: "competitors", label: "المنافسون أو البدائل", placeholder: "اختياري — اتركه فارغاً إن لم تكن تعرف", area: true, maxLength: 2000 },
        { key: "avoid", label: "ما ينبغي تجنبه", placeholder: "هل هناك ما ينبغي ألا يقلده MARKOS؟", area: true, maxLength: 1000 }
      ]
    },
    {
      ...steps[5]!,
      label: "كيف يبدو صوتك؟",
      description: "نبرة يستخدمها الإنشاء",
      title: "كيف ينبغي أن يتحدث النشاط؟",
      intro: "صف الصوت بأربع كلمات على الأكثر. استخدم اقتراحاً أو اكتب كلماتك الخاصة.",
      help: "تُستخدم كلمات النبرة وإرشادات الكتابة مباشرة للحفاظ على اتساق المحتوى الذي ينشئه الذكاء الاصطناعي.",
      suggestions: ["دافئ", "واضح", "واثق", "مرح", "احترافي", "مباشر", "تعليمي", "راقٍ"],
      fields: [
        {
          key: "toneWords",
          label: "نبرة الصوت",
          placeholder: "مثال: دافئ، واضح، واثق",
          helper: "افصل الكلمات بفواصل. يمكن إزالة الاقتراحات.",
          recommended: true,
          maxLength: 320
        },
        { key: "voice", label: "إرشادات الكتابة", placeholder: "مثال: واضح ودافئ، من دون مبالغة أو وعود كبيرة", area: true, maxLength: 1000 }
      ]
    },
    {
      ...steps[6]!,
      label: "الأولوية الحالية",
      description: "تؤكدها الاستراتيجية لاحقاً",
      title: "بماذا تريد من MARKOS أن يساعد أولاً؟",
      intro: "يمنح هذا ملف النشاط سياقاً مفيداً. ستطلب منك الاستراتيجية تأكيد الهدف والمدة أو تغييرهما.",
      help: "يمكن للأولوية الحالية توجيه التركيز التسويقي في الملف دون تقييد خطة الاستراتيجية لاحقاً.",
      suggestions: ["زيادة الوعي", "توليد عملاء محتملين", "زيادة المبيعات", "الترويج لعرض", "بناء مجتمع", "إطلاق شيء جديد"],
      fields: [{ key: "priority", label: "الأولوية الحالية", placeholder: "مثال: تعريف مكاتب المنامة بخدمة الضيافة الجديدة.", area: true, maxLength: 1000 }]
    }
  ];
}

type OnboardingCopy = ReturnType<typeof onboardingCopy>;

export function OnboardingPanel({
  editMode,
  initialDraft,
  initialState,
  locale
}: {
  editMode: boolean;
  initialDraft?: OnboardingDraft;
  initialState: OnboardingState;
  locale: Locale;
}) {
  const copy = useMemo(() => onboardingCopy(locale), [locale]);
  const steps = copy.steps;
  const reducedMotion = useReducedMotion();
  const isRtl = locale === "ar";
  const client = useMarkosClient(locale);
  const router = useRouter();
  const session = useMarkosSession();
  const [draft, setDraft] = useState<OnboardingDraft>(() => initialDraft ?? createEmptyOnboardingDraft());
  const [screen, setScreen] = useState<Screen>(() => initialScreen(initialState, editMode));
  const [step, setStep] = useState<OnboardingStepId>(() => initialStep(initialState));
  const [runtimeState, setRuntimeState] = useState(initialState);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileDraft, setProfileDraft] = useState<BusinessProfile | null>(initialState.businessProfile.profile);
  const [profileInteractionId, setProfileInteractionId] = useState<string | null>(initialState.businessProfile.interactionId);
  const [profileLanguage, setProfileLanguage] = useState<Locale>(locale);
  const [documentAnalysis, setDocumentAnalysis] = useState<OfferingDocumentAnalysisRecord | null>(null);
  const [documentCatalog, setDocumentCatalog] = useState<OfferingCatalogUpdate | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentMessage, setDocumentMessage] = useState("");
  const [backGuardOpen, setBackGuardOpen] = useState(false);
  const [backGuardBusy, setBackGuardBusy] = useState(false);
  const documentAnalysisLoaded = useRef(false);
  const workspaceNameApplied = useRef(false);
  const draftRef = useRef(draft);
  const stepEntryRef = useRef<{ draft: OnboardingDraft; step: OnboardingStepId } | null>(null);

  const showError = useCallback((body: string) => {
    setMessage(body);
  }, []);

  useEffect(() => {
    window.localStorage.removeItem(legacyOnboardingDraftKey);
    window.localStorage.removeItem(previousOnboardingDraftKey);
    const baseDraft = initialDraft ?? createEmptyOnboardingDraft();
    const stored = editMode ? null : window.localStorage.getItem(onboardingDraftKey);

    if (stored) {
      try {
        setDraft({ ...baseDraft, ...(JSON.parse(stored) as Partial<OnboardingDraft>) });
      } catch {
        window.localStorage.removeItem(onboardingDraftKey);
        setDraft(baseDraft);
      }
    } else {
      setDraft(baseDraft);
    }

    setHydrated(true);
  }, [editMode, initialDraft]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(onboardingDraftKey, JSON.stringify(draft));
  }, [draft, hydrated]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!hydrated || screen !== "step") return;
    stepEntryRef.current = { draft: draftRef.current, step };
  }, [hydrated, screen, step]);

  useEffect(() => {
    if (session) return;
    void initializeBrowserSession(locale).catch(() => showError(copy.errors.session));
  }, [copy.errors.session, locale, session, showError]);

  useEffect(() => {
    const workspaceName = session?.workspace.name.trim();
    if (!hydrated || !workspaceName || workspaceNameApplied.current) return;
    workspaceNameApplied.current = true;
    setDraft((current) => (current.businessName.trim() ? current : { ...current, businessName: workspaceName }));
  }, [hydrated, session]);

  useEffect(() => {
    if (!session || documentAnalysisLoaded.current) return;
    documentAnalysisLoaded.current = true;
    let cancelled = false;

    void client
      .offeringDocumentAnalysis()
      .then((analysis) => {
        if (!cancelled) syncDocumentAnalysis(analysis);
      })
      .catch(() => {
        if (!cancelled) documentAnalysisLoaded.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [client, session]);

  const activeStep = steps[step - 1]!;
  const validationIssue = validateOnboardingStep(step, draft);
  const canSave = hasOnboardingStepData(step, draft) && validationIssue === null;
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const NextIcon = isRtl ? ArrowLeft : ArrowRight;
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };

  function update<K extends DraftFieldKey>(key: K, value: OnboardingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function syncDocumentAnalysis(analysis: OfferingDocumentAnalysisRecord | null) {
    setDocumentAnalysis(analysis);
    setDocumentCatalog(analysis?.status === "READY" && analysis.result ? editableCatalog(analysis) : null);
  }

  async function analyzeDocumentFiles(files: FileList | File[]) {
    if (!session) {
      setDocumentMessage(copy.errors.session);
      return;
    }

    const selected = Array.from(files);
    const prepared = prepareOfferingDocuments(selected);
    if (!prepared.valid) {
      setDocumentMessage(copy.documents.invalid);
      return;
    }

    setDocumentBusy(true);
    setDocumentMessage("");
    try {
      const payload = await Promise.all(
        prepared.files.map(async ({ file, mimeType }) => ({
          filename: file.name,
          mimeType,
          base64Data: await fileAsBase64(file)
        }))
      );
      syncDocumentAnalysis(await client.analyzeOfferingDocuments(payload));
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : copy.documents.failed);
    } finally {
      setDocumentBusy(false);
    }
  }

  async function retryDocumentAnalysis() {
    if (!documentAnalysis) return;
    setDocumentBusy(true);
    setDocumentMessage("");
    try {
      syncDocumentAnalysis(await client.retryOfferingDocumentAnalysis(documentAnalysis.id));
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : copy.documents.failed);
    } finally {
      setDocumentBusy(false);
    }
  }

  async function discardDocumentAnalysis() {
    if (!documentAnalysis) return;
    setDocumentBusy(true);
    setDocumentMessage("");
    try {
      await client.discardOfferingDocumentAnalysis(documentAnalysis.id);
      syncDocumentAnalysis(null);
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : copy.documents.failed);
    } finally {
      setDocumentBusy(false);
    }
  }

  async function approveDocumentAnalysis() {
    if (!documentAnalysis || !documentCatalog) return;
    const catalog = cleanOfferingCatalog(documentCatalog);
    if (!catalog.summary && !catalog.items?.length) {
      setDocumentMessage(copy.errors.products);
      return;
    }
    const normalizedNames = (catalog.items ?? []).map((item) => item.name.normalize("NFKC").trim().toLocaleLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      setDocumentMessage(copy.documents.duplicate);
      return;
    }

    setDocumentBusy(true);
    setDocumentMessage("");
    try {
      const result = await client.approveOfferingDocumentAnalysis(documentAnalysis.id, catalog);
      setRuntimeState(result.onboarding);
      setDraft((current) => ({ ...current, offer: offeringCatalogSummary(catalog) }));
      syncDocumentAnalysis(result.analysis);
      advanceAfterStep();
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setDocumentBusy(false);
    }
  }

  function startSetup() {
    setScreen("step");
    setStep(initialStep(runtimeState));
  }

  async function saveAndContinue() {
    if (!session) {
      showError(copy.errors.session);
      return;
    }

    const issue = validateOnboardingStep(step, draft);
    if (issue) {
      showError(copy.errors[issue]);
      return;
    }

    if (!hasOnboardingStepData(step, draft)) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = payloadForOnboardingStep(step, draft);
      const state = await client.saveOnboardingModule(payload.module, payload.body);
      setRuntimeState(state);
      advanceAfterStep();
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setSaving(false);
    }
  }

  async function skipStep() {
    if (!session || !activeStep.skippable) return;
    setSaving(true);
    setMessage("");
    try {
      const state = await client.skipOnboardingModule(activeStep.module);
      setRuntimeState(state);
      advanceAfterStep();
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setSaving(false);
    }
  }

  function advanceAfterStep() {
    if (editingFromReview) {
      setEditingFromReview(false);
      setScreen("review");
      return;
    }

    if (step < 7) {
      setStep((step + 1) as OnboardingStepId);
    } else {
      setScreen("review");
    }
  }

  function performBack() {
    setMessage("");
    if (editingFromReview) {
      setEditingFromReview(false);
      setScreen("review");
      return;
    }
    if (step > 1) {
      setStep((step - 1) as OnboardingStepId);
      return;
    }
    if (!editMode) setScreen("greeting");
  }

  function goBack() {
    const entry = stepEntryRef.current;
    const changed = entry?.step === step && onboardingStepHasChanges(step, entry.draft, draft);
    const containsData = hasOnboardingStepData(step, draft) || (entry?.step === step && hasOnboardingStepData(step, entry.draft));
    const hasOpenDocumentAnalysis = step === 3 && (documentAnalysis?.status === "READY" || documentAnalysis?.status === "FAILED");

    if ((changed && containsData) || hasOpenDocumentAnalysis) {
      setBackGuardOpen(true);
      return;
    }
    performBack();
  }

  async function discardStepChanges() {
    const entry = stepEntryRef.current;
    setBackGuardBusy(true);
    setMessage("");
    try {
      if (step === 3 && documentAnalysis && (documentAnalysis.status === "READY" || documentAnalysis.status === "FAILED")) {
        await client.discardOfferingDocumentAnalysis(documentAnalysis.id);
        syncDocumentAnalysis(null);
      }
      if (entry?.step === step) setDraft((current) => restoreOnboardingStep(step, entry.draft, current));
      setBackGuardOpen(false);
      performBack();
    } catch (error) {
      setBackGuardOpen(false);
      showError(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setBackGuardBusy(false);
    }
  }

  function editReviewStep(target: OnboardingStepId) {
    setStep(target);
    setEditingFromReview(true);
    setScreen("step");
    setMessage("");
  }

  function toggleSuggestion(value: string) {
    const target = activeStep.suggestionTarget;
    if (!target) return;

    if (activeStep.suggestionMode === "single") {
      update(target, (draft[target] === value ? "" : value) as OnboardingDraft[typeof target]);
      return;
    }

    const current = splitOnboardingList(String(draft[target]));
    const next = current.includes(value) ? current.filter((item) => item !== value) : current.length < 4 ? [...current, value] : current;
    update(target, next.join(", ") as OnboardingDraft[typeof target]);
  }

  async function generateProfile() {
    if (!session) {
      showError(copy.errors.session);
      return;
    }

    setScreen("profile");
    setProfileLoading(true);
    setMessage("");
    try {
      const state = await client.generateBusinessProfile();
      setRuntimeState(state);
      setProfileDraft(state.businessProfile.profile);
      setProfileInteractionId(state.businessProfile.interactionId);
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.generate);
    } finally {
      setProfileLoading(false);
    }
  }

  async function approveProfile() {
    if (!profileDraft || !profileInteractionId || !session) {
      showError(copy.errors.approve);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await client.approveBusinessProfile({ interactionId: profileInteractionId, profile: profileDraft });
      window.localStorage.removeItem(onboardingDraftKey);
      router.push(`/${locale}/app/strategy`);
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.approve);
      setSaving(false);
    }
  }

  function updateBusinessName(value: string) {
    setProfileDraft((current) => (current ? { ...current, businessName: value } : current));
  }

  function updateProfileField(field: ProfileFieldKey, language: Locale, value: string) {
    setProfileDraft((current) => (current ? { ...current, [field]: { ...current[field], [language]: value } } : current));
  }

  return (
    <main className="sunlit-theme onboarding-stage relative min-h-screen overflow-hidden text-[var(--sunlit-ink)]" dir={isRtl ? "rtl" : "ltr"}>
      <div aria-hidden="true" className="onboarding-orb onboarding-orb-one" />
      <div aria-hidden="true" className="onboarding-orb onboarding-orb-two" />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a className="flex items-center gap-3 text-[var(--sunlit-ink)]" href={`/${locale}`}>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)] shadow-[0_14px_30px_rgb(32_33_43_/_18%)]">
            <Sparkles size={21} strokeWidth={2.35} />
          </span>
          <strong className="text-[16px] font-bold tracking-tight">MARKOS AI</strong>
        </a>
        {screen !== "greeting" ? (
          <span className="rounded-full border border-[var(--sunlit-line)] bg-white/75 px-3 py-1.5 text-[13px] font-bold text-[var(--sunlit-muted)] backdrop-blur">
            {screen === "step" ? copy.step(step, 7) : screen === "review" ? copy.informationCheck : copy.profile.eyebrow}
          </span>
        ) : null}
      </header>

      {message ? (
        <div className="relative z-10 mx-auto mb-4 w-full max-w-6xl px-5 sm:px-8" role="alert">
          <div className="flex items-start gap-3 rounded-2xl border border-[rgb(199_53_80_/_20%)] bg-[rgb(255_244_246_/_96%)] px-4 py-3 text-[15px] text-[var(--sunlit-ink-soft)] shadow-sm">
            <Info className="mt-0.5 shrink-0 text-[var(--sunlit-danger)]" size={18} />
            <div className="min-w-0 flex-1">
              <strong className="block font-bold text-[var(--sunlit-danger)]">{copy.attention}</strong>
              <span className="mt-0.5 block leading-6">{message}</span>
            </div>
            <button
              aria-label={copy.dismiss}
              className="rounded-lg p-1 text-[var(--sunlit-muted)] hover:bg-white hover:text-[var(--sunlit-ink)]"
              onClick={() => setMessage("")}
              type="button"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="relative z-[1]"
          exit={{ opacity: 0, y: reducedMotion ? 0 : -10 }}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }}
          key={`${screen}-${screen === "step" ? step : "screen"}`}
          transition={transition}
        >
          {screen === "greeting" ? <Greeting copy={copy} onStart={startSetup} /> : null}
          {screen === "step" ? (
            <StepScreen
              BackIcon={BackIcon}
              NextIcon={NextIcon}
              canSave={canSave}
              copy={copy}
              documentAnalysis={documentAnalysis}
              documentBusy={documentBusy}
              documentCatalog={documentCatalog}
              documentMessage={documentMessage}
              draft={draft}
              locale={locale}
              onAnalyzeDocuments={(files) => void analyzeDocumentFiles(files)}
              onBack={goBack}
              onCatalogChange={(catalog) => {
                setDocumentCatalog(catalog);
                setDocumentMessage("");
              }}
              onDiscardDocument={() => void discardDocumentAnalysis()}
              onApproveDocument={() => void approveDocumentAnalysis()}
              onRetryDocument={() => void retryDocumentAnalysis()}
              onSave={() => void saveAndContinue()}
              onSkip={() => void skipStep()}
              onSuggestion={toggleSuggestion}
              saving={saving}
              step={activeStep}
              steps={steps}
              update={update}
              validationIssue={validationIssue}
            />
          ) : null}
          {screen === "review" ? (
            <ReviewScreen
              copy={copy}
              draft={draft}
              onBack={() => {
                setStep(7);
                setScreen("step");
              }}
              onCreate={() => void generateProfile()}
              onEdit={editReviewStep}
              readyForProfile={runtimeState.readyForProfile || (draft.businessName.trim().length >= 2 && draft.offer.trim().length >= 2)}
              saving={profileLoading}
            />
          ) : null}
          {screen === "profile" ? (
            <ProfileScreen
              copy={copy}
              language={profileLanguage}
              loading={profileLoading}
              onApprove={() => void approveProfile()}
              onBack={() => setScreen("review")}
              onRegenerate={() => void generateProfile()}
              profile={profileDraft}
              saving={saving}
              setLanguage={setProfileLanguage}
              updateBusinessName={updateBusinessName}
              updateProfileField={updateProfileField}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      {backGuardOpen ? (
        <OnboardingBackGuard busy={backGuardBusy} copy={copy} onDiscard={() => void discardStepChanges()} onKeepEditing={() => setBackGuardOpen(false)} />
      ) : null}
    </main>
  );
}

function Greeting({ copy, onStart }: { copy: OnboardingCopy; onStart: () => void }) {
  return (
    <section className="mx-auto grid min-h-[calc(100vh-96px)] w-full max-w-6xl place-items-center px-5 pb-12 sm:px-8">
      <div className="w-full max-w-5xl text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)] shadow-[0_22px_48px_rgb(32_33_43_/_22%)]">
          <Sparkles size={28} />
        </span>
        <p className="mt-6 text-[13px] font-bold uppercase tracking-[.12em] text-[var(--sunlit-pink)]">{copy.greeting.eyebrow}</p>
        <h1 className="mx-auto mt-3 max-w-4xl font-display text-[clamp(42px,5vw,68px)] font-bold leading-[1.03] tracking-[-0.05em] text-[var(--sunlit-ink)] rtl:tracking-normal">
          {copy.greeting.title}
        </h1>

        <div className="mt-8 grid gap-3 text-start md:grid-cols-3">
          {copy.greeting.journey.map((title, index) => (
            <article className="sunlit-panel flex items-center gap-3 rounded-2xl bg-white/82 p-4 backdrop-blur" key={title}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sunlit-aqua-soft)] text-[13px] font-bold text-[var(--sunlit-aqua-dark)]">
                {index + 1}
              </span>
              <h2 className="text-[15px] font-bold leading-6">{title}</h2>
            </article>
          ))}
        </div>

        <button
          className="sunlit-primary mt-8 inline-flex min-w-56 items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold"
          onClick={onStart}
          type="button"
        >
          {copy.greeting.start}
          <ArrowRight className="rtl:rotate-180" size={17} />
        </button>
      </div>
    </section>
  );
}

function OnboardingBackGuard({
  busy,
  copy,
  onDiscard,
  onKeepEditing
}: {
  busy: boolean;
  copy: OnboardingCopy;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  useEffect(() => {
    function keepEditingOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onKeepEditing();
    }

    document.addEventListener("keydown", keepEditingOnEscape);
    return () => document.removeEventListener("keydown", keepEditingOnEscape);
  }, [busy, onKeepEditing]);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[rgb(32_33_43_/_58%)] p-5 backdrop-blur-sm">
      <article
        aria-describedby="onboarding-back-guard-description"
        aria-labelledby="onboarding-back-guard-title"
        aria-modal="true"
        className="sunlit-panel w-full max-w-lg rounded-[1.75rem] p-6 shadow-2xl"
        role="dialog"
      >
        <p className="sunlit-eyebrow">{copy.backGuard.eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]" id="onboarding-back-guard-title">
          {copy.backGuard.title}
        </h2>
        <p className="mt-4 text-[15px] leading-6 text-[var(--sunlit-muted)]" id="onboarding-back-guard-description">
          {copy.backGuard.description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="sunlit-secondary min-h-11 rounded-xl px-5 text-[14px] font-bold disabled:opacity-50"
            disabled={busy}
            onClick={onKeepEditing}
            type="button"
          >
            {copy.backGuard.keep}
          </button>
          <button
            className="min-h-11 rounded-xl border border-[rgb(217_63_122_/_28%)] bg-white px-5 text-[14px] font-bold text-[var(--sunlit-pink)] disabled:opacity-50"
            disabled={busy}
            onClick={onDiscard}
            type="button"
          >
            {copy.backGuard.discard}
          </button>
        </div>
      </article>
    </div>
  );
}

function StepScreen({
  BackIcon,
  NextIcon,
  canSave,
  copy,
  documentAnalysis,
  documentBusy,
  documentCatalog,
  documentMessage,
  draft,
  locale,
  onAnalyzeDocuments,
  onApproveDocument,
  onBack,
  onCatalogChange,
  onDiscardDocument,
  onRetryDocument,
  onSave,
  onSkip,
  onSuggestion,
  saving,
  step,
  steps,
  update,
  validationIssue
}: {
  BackIcon: Icon;
  NextIcon: Icon;
  canSave: boolean;
  copy: OnboardingCopy;
  documentAnalysis: OfferingDocumentAnalysisRecord | null;
  documentBusy: boolean;
  documentCatalog: OfferingCatalogUpdate | null;
  documentMessage: string;
  draft: OnboardingDraft;
  locale: Locale;
  onAnalyzeDocuments: (files: FileList | File[]) => void;
  onApproveDocument: () => void;
  onBack: () => void;
  onCatalogChange: (catalog: OfferingCatalogUpdate | null) => void;
  onDiscardDocument: () => void;
  onRetryDocument: () => void;
  onSave: () => void;
  onSkip: () => void;
  onSuggestion: (value: string) => void;
  saving: boolean;
  step: StepDefinition;
  steps: StepDefinition[];
  update: <K extends DraftFieldKey>(key: K, value: OnboardingDraft[K]) => void;
  validationIssue: ReturnType<typeof validateOnboardingStep>;
}) {
  const StepIcon = step.icon;
  const previous = step.id > 1 ? steps[step.id - 2] : null;
  const next = step.id < 7 ? steps[step.id] : null;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-8 sm:px-8 lg:pb-6">
      <div className="mb-4 grid grid-cols-[1fr_1.25fr_1fr] gap-2 sm:gap-3">
        <ContextItem label={copy.previous} muted title={previous?.label ?? ""} />
        <ContextItem current label={copy.step(step.id, 7)} title={step.label} />
        <ContextItem label={copy.next} muted title={next?.label ?? copy.informationCheck} />
      </div>

      <section className="sunlit-panel overflow-hidden rounded-[2rem] bg-white/90 backdrop-blur-xl">
        <div className="h-1.5 bg-[var(--sunlit-paper-deep)]">
          <div
            className="h-full rounded-e-full bg-[linear-gradient(90deg,var(--sunlit-coral),var(--sunlit-yellow))] transition-[width] duration-300"
            style={{ width: `${(step.id / 7) * 100}%` }}
          />
        </div>
        <div className="grid gap-8 p-6 sm:p-8 lg:min-h-[510px] lg:grid-cols-[minmax(0,1.65fr)_minmax(250px,.75fr)] lg:p-10">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
                <StepIcon size={22} />
              </span>
              <div>
                <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">{step.title}</h1>
                <p className="mt-2 max-w-2xl text-[16px] leading-7 text-[var(--sunlit-ink-soft)]">{step.intro}</p>
              </div>
            </div>

            {step.suggestions ? (
              <div className="mt-7">
                <p className="text-[13px] font-bold uppercase tracking-[.08em] text-[var(--sunlit-muted)]">{copy.suggestions}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {step.suggestions.map((suggestion) => {
                    const target = step.suggestionTarget;
                    const current = target ? String(draft[target]) : "";
                    const active = step.suggestionMode === "single" ? current === suggestion : splitOnboardingList(current).includes(suggestion);
                    return (
                      <button
                        aria-pressed={active}
                        className={
                          active
                            ? "rounded-full border border-[rgb(33_191_174_/_35%)] bg-[var(--sunlit-aqua-soft)] px-3.5 py-2 text-[14px] font-bold text-[var(--sunlit-aqua-dark)]"
                            : "rounded-full border border-[var(--sunlit-line)] bg-white px-3.5 py-2 text-[14px] font-bold text-[var(--sunlit-ink-soft)] hover:border-[var(--sunlit-line-strong)]"
                        }
                        key={suggestion}
                        onClick={() => onSuggestion(suggestion)}
                        type="button"
                      >
                        {active ? <Check className="me-1 inline" size={13} /> : null}
                        {suggestion}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              {step.fields.map((field, index) => (
                <OnboardingField
                  copy={copy}
                  field={field}
                  full={
                    field.full ||
                    step.fields.length === 1 ||
                    (!step.fields.some((item) => item.full) && index === step.fields.length - 1 && step.fields.length % 2 === 1)
                  }
                  key={field.key}
                  onChange={(value) => update(field.key, value)}
                  value={String(draft[field.key])}
                />
              ))}
            </div>

            {step.id === 3 ? (
              <OfferingDocumentAssistant
                analysis={documentAnalysis}
                busy={documentBusy}
                catalog={documentCatalog}
                copy={copy}
                locale={locale}
                message={documentMessage}
                onAnalyze={onAnalyzeDocuments}
                onApprove={onApproveDocument}
                onCatalogChange={onCatalogChange}
                onDiscard={onDiscardDocument}
                onRetry={onRetryDocument}
              />
            ) : null}

            {validationIssue ? <p className="mt-4 text-[14px] font-semibold text-[var(--sunlit-danger)]">{copy.errors[validationIssue]}</p> : null}
          </div>

          <aside className="self-start rounded-2xl border border-[rgb(33_191_174_/_22%)] bg-[var(--sunlit-aqua-soft)]/70 p-5">
            <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--sunlit-aqua-dark)]">
              <Info size={17} />
              {copy.helpTitle}
            </div>
            <p className="mt-3 text-[15px] leading-6 text-[var(--sunlit-ink-soft)]">{step.help}</p>
            <div className="mt-5 flex items-center gap-2 border-t border-[rgb(33_191_174_/_18%)] pt-4 text-[13px] font-bold text-[var(--sunlit-muted)]">
              {step.skippable ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
              {step.skippable ? copy.optional : copy.essential}
            </div>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--sunlit-line)] bg-white/65 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <button
            className="sunlit-secondary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold"
            disabled={saving || documentBusy || documentAnalysis?.status === "PROCESSING"}
            onClick={onBack}
            type="button"
          >
            <BackIcon size={16} />
            {copy.back}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {step.skippable ? (
              <button
                className="rounded-xl px-5 py-3 text-[14px] font-bold text-[var(--sunlit-muted)] hover:bg-[var(--sunlit-paper-deep)] hover:text-[var(--sunlit-ink)]"
                disabled={saving}
                onClick={onSkip}
                type="button"
              >
                {copy.skip}
              </button>
            ) : null}
            <button
              className="sunlit-primary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-[14px] font-bold disabled:translate-y-0 disabled:opacity-40"
              disabled={saving || !canSave}
              onClick={onSave}
              type="button"
            >
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : null}
              {copy.saveContinue}
              <NextIcon size={16} />
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}

function OfferingDocumentAssistant({
  analysis,
  busy,
  catalog,
  copy,
  locale,
  message,
  onAnalyze,
  onApprove,
  onCatalogChange,
  onDiscard,
  onRetry
}: {
  analysis: OfferingDocumentAnalysisRecord | null;
  busy: boolean;
  catalog: OfferingCatalogUpdate | null;
  copy: OnboardingCopy;
  locale: Locale;
  message: string;
  onAnalyze: (files: FileList | File[]) => void;
  onApprove: () => void;
  onCatalogChange: (catalog: OfferingCatalogUpdate | null) => void;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  const items = catalog?.items ?? [];

  function updateItem(index: number, patch: Partial<(typeof items)[number]>) {
    if (!catalog) return;
    onCatalogChange({
      ...catalog,
      items: items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    });
  }

  function removeItem(index: number) {
    if (!catalog) return;
    onCatalogChange({ ...catalog, items: items.filter((_item, itemIndex) => itemIndex !== index) });
  }

  const waiting = busy || analysis?.status === "PROCESSING";
  const canRetry = canRetryOfferingDocumentFailure(analysis?.failureCode);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)]">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sunlit-yellow-soft)] text-[var(--sunlit-warning)]">
          <FileText size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-bold text-[var(--sunlit-ink)]">{copy.documents.title}</h2>
            <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-[var(--sunlit-muted)] ring-1 ring-[var(--sunlit-line)]">
              {copy.documents.optional}
            </span>
          </div>
          <p className="mt-1.5 max-w-3xl text-[14px] leading-6 text-[var(--sunlit-ink-soft)]">{copy.documents.body}</p>
        </div>
      </div>

      {analysis === null && !busy ? (
        <label
          className="mx-4 mb-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-[rgb(33_191_174_/_48%)] bg-white px-4 py-3 hover:border-[var(--sunlit-aqua)] hover:bg-[var(--sunlit-aqua-soft)]/35 sm:mx-5"
          onDragOver={(event: DragEvent<HTMLLabelElement>) => event.preventDefault()}
          onDrop={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            onAnalyze(event.dataTransfer.files);
          }}
        >
          <span className="flex min-w-0 items-center gap-3">
            <UploadCloud className="shrink-0 text-[var(--sunlit-aqua-dark)]" size={21} />
            <span>
              <strong className="block text-[14px] font-bold text-[var(--sunlit-ink)]">{copy.documents.choose}</strong>
              <span className="mt-0.5 block text-[12px] leading-5 text-[var(--sunlit-muted)]">{copy.documents.expires}</span>
            </span>
          </span>
          <span className="sunlit-secondary hidden shrink-0 rounded-lg px-3 py-2 text-[13px] font-bold sm:inline-flex">{copy.documents.analyze}</span>
          <input
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            multiple
            name="offering-documents"
            onChange={(event) => {
              if (event.target.files) onAnalyze(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      ) : null}

      {waiting ? (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-white px-4 py-4 text-[14px] font-bold text-[var(--sunlit-ink-soft)] sm:mx-5">
          <LoaderCircle className="animate-spin text-[var(--sunlit-aqua-dark)]" size={19} />
          {copy.documents.analyzing}
        </div>
      ) : null}

      {analysis?.status === "FAILED" && !busy ? (
        <div className="mx-4 mb-4 rounded-xl border border-[rgb(199_53_80_/_18%)] bg-white p-4 sm:mx-5">
          <p className="text-[14px] leading-6 text-[var(--sunlit-ink-soft)]">{offeringDocumentFailureMessage(locale, analysis.failureCode)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canRetry ? (
              <button className="sunlit-secondary inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-bold" onClick={onRetry} type="button">
                <RefreshCw size={14} />
                {copy.documents.retry}
              </button>
            ) : null}
            <button
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-bold text-[var(--sunlit-danger)] hover:bg-[rgb(199_53_80_/_7%)]"
              onClick={onDiscard}
              type="button"
            >
              <Trash2 size={14} />
              {copy.documents.discard}
            </button>
          </div>
        </div>
      ) : null}

      {analysis?.status === "READY" && catalog && !busy ? (
        <div className="border-t border-[var(--sunlit-line)] bg-white px-4 py-5 sm:px-5">
          <h3 className="text-[17px] font-bold text-[var(--sunlit-ink)]">{copy.documents.reviewTitle}</h3>
          <p className="mt-1 text-[14px] leading-6 text-[var(--sunlit-ink-soft)]">{copy.documents.reviewBody}</p>

          <label className="mt-4 block">
            <span className="text-[14px] font-bold text-[var(--sunlit-ink-soft)]">{copy.documents.summary}</span>
            <textarea
              className="sunlit-field mt-2 min-h-24 resize-y rounded-xl px-3.5 py-3 text-[14px] leading-6 outline-none"
              maxLength={4000}
              name="offering-document-summary"
              onChange={(event) => onCatalogChange({ ...catalog, summary: event.target.value })}
              value={catalog.summary ?? ""}
            />
          </label>

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <article className="rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-3.5" key={`${index}-${item.name}`}>
                <div className="grid gap-3 sm:grid-cols-[145px_minmax(0,1fr)_auto]">
                  <select
                    aria-label={`${copy.documents.kind} ${index + 1}`}
                    className="sunlit-field rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    name={`offering-${index}-kind`}
                    onChange={(event) => updateItem(index, { kind: event.target.value as "PRODUCT" | "SERVICE" | "UNSPECIFIED" })}
                    value={item.kind ?? "UNSPECIFIED"}
                  >
                    <option value="UNSPECIFIED">{copy.documents.kindUnknown}</option>
                    <option value="PRODUCT">{copy.documents.kindProduct}</option>
                    <option value="SERVICE">{copy.documents.kindService}</option>
                  </select>
                  <input
                    aria-label={copy.documents.itemName}
                    className="sunlit-field rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    maxLength={160}
                    name={`offering-${index}-name`}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                    placeholder={copy.documents.itemName}
                    value={item.name}
                  />
                  <button
                    aria-label={copy.documents.remove}
                    className="rounded-lg p-2.5 text-[var(--sunlit-muted)] hover:bg-[rgb(199_53_80_/_7%)] hover:text-[var(--sunlit-danger)]"
                    onClick={() => removeItem(index)}
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <textarea
                  aria-label={copy.documents.itemDescription}
                  className="sunlit-field mt-3 min-h-20 resize-y rounded-lg px-3 py-2.5 text-[14px] leading-6 outline-none"
                  maxLength={1000}
                  name={`offering-${index}-description`}
                  onChange={(event) => updateItem(index, { description: event.target.value })}
                  placeholder={copy.documents.itemDescription}
                  value={item.description ?? ""}
                />
              </article>
            ))}
          </div>

          <button
            className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-[var(--sunlit-aqua-dark)] hover:bg-[var(--sunlit-aqua-soft)]"
            onClick={() =>
              onCatalogChange({
                ...catalog,
                items: [...items, { kind: "UNSPECIFIED", name: "", description: "", currency: "BHD" }]
              })
            }
            type="button"
          >
            <Plus size={15} />
            {copy.documents.add}
          </button>

          {analysis.result?.issues.length ? (
            <div className="mt-4 space-y-2">
              {analysis.result.issues.map((issue, index) => (
                <div
                  className="flex items-start gap-2 rounded-lg bg-[var(--sunlit-yellow-soft)] px-3 py-2.5 text-[13px] leading-5 text-[var(--sunlit-ink-soft)]"
                  key={`${issue.code}-${index}`}
                >
                  <Info className="mt-0.5 shrink-0 text-[var(--sunlit-warning)]" size={15} />
                  {copy.documents.issue(issue.code, issue.message)}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[var(--sunlit-line)] pt-4 sm:flex-row sm:justify-end">
            <button
              className="rounded-lg px-4 py-2.5 text-[13px] font-bold text-[var(--sunlit-danger)] hover:bg-[rgb(199_53_80_/_7%)]"
              onClick={onDiscard}
              type="button"
            >
              {copy.documents.discard}
            </button>
            <button
              className="sunlit-primary inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-bold"
              onClick={onApprove}
              type="button"
            >
              <Check size={16} />
              {copy.documents.use}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mx-4 mb-4 text-[13px] font-semibold leading-5 text-[var(--sunlit-danger)] sm:mx-5">{message}</p> : null}
    </section>
  );
}

function ContextItem({ current = false, label, muted = false, title }: { current?: boolean; label: string; muted?: boolean; title: string }) {
  return (
    <div
      className={
        current
          ? "rounded-2xl border border-[rgb(217_63_122_/_20%)] bg-white/90 px-3 py-3 text-center shadow-sm"
          : "rounded-2xl border border-white/55 bg-white/45 px-3 py-3 text-center backdrop-blur"
      }
    >
      <span className="block text-[12px] font-bold uppercase tracking-[.08em] text-[var(--sunlit-muted)]">{label}</span>
      <strong
        className={
          muted ? "mt-1 block min-h-5 truncate text-[14px] text-[rgb(98_91_102_/_72%)]" : "mt-1 block min-h-5 truncate text-[14px] text-[var(--sunlit-ink)]"
        }
      >
        {title || <span aria-hidden="true">&nbsp;</span>}
      </strong>
    </div>
  );
}

function OnboardingField({
  copy,
  field,
  full,
  onChange,
  value
}: {
  copy: OnboardingCopy;
  field: FieldDefinition;
  full: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputClass = "sunlit-field mt-2 rounded-xl px-4 py-3 text-[15px] leading-6 outline-none";
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="flex items-center gap-2 text-[15px] font-bold text-[var(--sunlit-ink-soft)]">
        {field.label}
        {field.recommended ? (
          <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-2 py-0.5 text-[12px] font-bold text-[var(--sunlit-pink)]">{copy.recommended}</span>
        ) : null}
      </span>
      {field.area ? (
        <textarea
          className={`${inputClass} min-h-24 w-full resize-y`}
          dir="auto"
          maxLength={field.maxLength}
          name={`onboarding-${field.key}`}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={value}
        />
      ) : (
        <input
          className={`${inputClass} min-h-12 w-full`}
          dir="auto"
          maxLength={field.maxLength}
          name={`onboarding-${field.key}`}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={value}
        />
      )}
      {field.helper ? <span className="mt-1.5 block text-[14px] leading-5 text-[var(--sunlit-muted)]">{field.helper}</span> : null}
    </label>
  );
}

function ReviewScreen({
  copy,
  draft,
  onBack,
  onCreate,
  onEdit,
  readyForProfile,
  saving
}: {
  copy: OnboardingCopy;
  draft: OnboardingDraft;
  onBack: () => void;
  onCreate: () => void;
  onEdit: (step: OnboardingStepId) => void;
  readyForProfile: boolean;
  saving: boolean;
}) {
  const targets: OnboardingStepId[] = [1, 3, 4, 2, 5, 6, 7];
  return (
    <section className="mx-auto w-full max-w-5xl px-5 pb-12 sm:px-8">
      <section className="sunlit-panel rounded-[2rem] bg-white/92 p-6 backdrop-blur-xl sm:p-9 lg:p-10">
        <div className="max-w-3xl">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
            <ShieldCheck size={23} />
          </span>
          <h1 className="mt-5 font-display text-[32px] font-bold leading-tight tracking-tight sm:text-[38px]">{copy.review.title}</h1>
          <p className="mt-3 text-[16px] leading-7 text-[var(--sunlit-ink-soft)]">{copy.review.body}</p>
        </div>

        <div className="mt-7 grid gap-3">
          {copy.review.rows.map(([title, note], index) => {
            const target = targets[index]!;
            const ready = hasOnboardingStepData(target, draft) && validateOnboardingStep(target, draft) === null;
            const required = target === 1 || target === 3;
            return (
              <button
                className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] px-5 py-4 text-start transition hover:-translate-y-0.5 hover:border-[rgb(33_191_174_/_32%)] hover:bg-white hover:shadow-sm"
                key={title}
                onClick={() => onEdit(target)}
                type="button"
              >
                <span className="min-w-0">
                  <strong className="block text-[16px] font-bold">{title}</strong>
                  <span className="mt-1 block text-[14px] text-[var(--sunlit-muted)]">{note}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={
                      ready
                        ? "rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-[13px] font-bold text-[var(--sunlit-aqua-dark)]"
                        : required
                          ? "rounded-full bg-[rgb(199_53_80_/_10%)] px-3 py-1.5 text-[13px] font-bold text-[var(--sunlit-danger)]"
                          : "rounded-full bg-[rgb(98_91_102_/_8%)] px-3 py-1.5 text-[13px] font-bold text-[var(--sunlit-muted)]"
                    }
                  >
                    {ready ? copy.review.ready : required ? copy.essential : copy.notAdded}
                  </span>
                  <span className="hidden items-center gap-1 text-[13px] font-bold text-[var(--sunlit-aqua-dark)] group-hover:flex sm:flex">
                    <Pencil size={13} />
                    {copy.edit}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[var(--sunlit-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button className="sunlit-secondary rounded-xl px-5 py-3 text-[14px] font-bold" onClick={onBack} type="button">
            {copy.back}
          </button>
          <button
            className="sunlit-primary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[14px] font-bold disabled:translate-y-0 disabled:opacity-40"
            disabled={!readyForProfile || saving}
            onClick={onCreate}
            type="button"
          >
            {saving ? <LoaderCircle className="animate-spin" size={17} /> : <WandSparkles size={17} />}
            {readyForProfile ? copy.review.create : copy.review.missingEssential}
          </button>
        </div>
      </section>
    </section>
  );
}

function ProfileScreen({
  copy,
  language,
  loading,
  onApprove,
  onBack,
  onRegenerate,
  profile,
  saving,
  setLanguage,
  updateBusinessName,
  updateProfileField
}: {
  copy: OnboardingCopy;
  language: Locale;
  loading: boolean;
  onApprove: () => void;
  onBack: () => void;
  onRegenerate: () => void;
  profile: BusinessProfile | null;
  saving: boolean;
  setLanguage: (locale: Locale) => void;
  updateBusinessName: (value: string) => void;
  updateProfileField: (field: ProfileFieldKey, locale: Locale, value: string) => void;
}) {
  if (loading) {
    return (
      <section className="mx-auto grid min-h-[calc(100vh-110px)] max-w-4xl place-items-center px-5 pb-12 text-center">
        <div>
          <span className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)]">
            <span className="absolute inset-0 animate-ping rounded-[2rem] bg-[rgb(33_191_174_/_10%)]" />
            <LoaderCircle className="relative animate-spin text-[var(--sunlit-aqua-dark)]" size={38} />
          </span>
          <h1 className="mt-7 font-display text-[32px] font-bold leading-tight tracking-tight sm:text-[38px]">{copy.profile.generatingTitle}</h1>
          <p className="mx-auto mt-3 max-w-xl text-[16px] leading-7 text-[var(--sunlit-ink-soft)]">{copy.profile.generatingBody}</p>
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="mx-auto grid min-h-[calc(100vh-110px)] max-w-4xl place-items-center px-5 pb-12 text-center">
        <div className="sunlit-panel rounded-[2rem] bg-white/90 p-9">
          <h1 className="font-display text-[32px] font-bold leading-tight">{copy.errors.generate}</h1>
          <button className="sunlit-primary mt-6 rounded-xl px-6 py-3 text-[14px] font-bold" onClick={onRegenerate} type="button">
            {copy.profile.regenerate}
          </button>
        </div>
      </section>
    );
  }

  const valid = businessProfileIsComplete(profile);
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
      <section className="sunlit-panel rounded-[2rem] bg-white/92 p-6 backdrop-blur-xl sm:p-9 lg:p-10">
        <div className="flex flex-col gap-5 border-b border-[var(--sunlit-line)] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <span className="sunlit-eyebrow inline-flex items-center gap-2">
              <Sparkles size={14} />
              {copy.profile.eyebrow}
            </span>
            <h1 className="mt-3 font-display text-[32px] font-bold leading-tight tracking-tight sm:text-[38px]">{copy.profile.title}</h1>
            <p className="mt-3 text-[16px] leading-7 text-[var(--sunlit-ink-soft)]">{copy.profile.body}</p>
          </div>
          <div
            className="inline-flex shrink-0 self-start rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-1"
            aria-label="Profile language"
          >
            <LanguageButton active={language === "en"} onClick={() => setLanguage("en")}>
              English
            </LanguageButton>
            <LanguageButton active={language === "ar"} onClick={() => setLanguage("ar")}>
              العربية
            </LanguageButton>
          </div>
        </div>

        <label className="mt-6 block rounded-2xl border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[.08em] text-[var(--sunlit-aqua-dark)]">{copy.profile.businessName}</span>
          <input
            className="mt-2 w-full bg-transparent font-display text-2xl font-bold outline-none"
            dir="auto"
            onChange={(event) => updateBusinessName(event.target.value)}
            value={profile.businessName}
          />
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {profileFieldKeys.map((field, index) => (
            <label
              className={
                index === 1
                  ? "rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5 md:col-span-2"
                  : "rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5"
              }
              key={field}
            >
              <span className="text-[13px] font-bold uppercase tracking-[.07em] text-[var(--sunlit-muted)]">{copy.profile.fields[field]}</span>
              <textarea
                className="mt-3 min-h-24 w-full resize-y bg-transparent text-[16px] leading-7 outline-none"
                dir={language === "ar" ? "rtl" : "ltr"}
                onChange={(event) => updateProfileField(field, language, event.target.value)}
                value={profile[field][language]}
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[rgb(246_196_83_/_38%)] bg-[rgb(246_196_83_/_14%)] p-4">
          <Languages className="mt-0.5 shrink-0 text-[var(--sunlit-warning)]" size={18} />
          <p className="text-[15px] leading-6 text-[var(--sunlit-ink-soft)]">{copy.profile.editHint}</p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button className="sunlit-secondary rounded-xl px-5 py-3 text-[14px] font-bold" disabled={saving} onClick={onBack} type="button">
              {copy.profile.back}
            </button>
            <button
              className="sunlit-secondary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold"
              disabled={saving}
              onClick={onRegenerate}
              type="button"
            >
              <RefreshCw size={15} />
              {copy.profile.regenerate}
            </button>
          </div>
          <button
            className="sunlit-primary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[14px] font-bold disabled:translate-y-0 disabled:opacity-40"
            disabled={saving || !valid}
            onClick={onApprove}
            type="button"
          >
            {saving ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
            {copy.profile.approve}
          </button>
        </div>
      </section>
    </section>
  );
}

function LanguageButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={
        active
          ? "rounded-lg bg-[var(--sunlit-ink)] px-4 py-2 text-[14px] font-bold text-white shadow-sm"
          : "rounded-lg px-4 py-2 text-[14px] font-bold text-[var(--sunlit-muted)]"
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

type OfferingDocumentMimeType = "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/plain";

function prepareOfferingDocuments(files: File[]): { valid: true; files: Array<{ file: File; mimeType: OfferingDocumentMimeType }> } | { valid: false } {
  if (files.length < 1 || files.length > 2) return { valid: false };

  let totalBytes = 0;
  const prepared: Array<{ file: File; mimeType: OfferingDocumentMimeType }> = [];
  for (const file of files) {
    const extension = file.name.toLocaleLowerCase().match(/\.[^.]+$/)?.[0];
    const mimeType: OfferingDocumentMimeType | undefined =
      extension === ".pdf"
        ? "application/pdf"
        : extension === ".docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : extension === ".txt"
            ? "text/plain"
            : undefined;
    totalBytes += file.size;
    if (!mimeType || file.name.length > 180 || file.size < 1 || file.size > 8_000_000) return { valid: false };
    prepared.push({ file, mimeType });
  }

  return totalBytes <= 12_000_000 ? { valid: true, files: prepared } : { valid: false };
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected document"));
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0) {
        reject(new Error("Could not read the selected document"));
        return;
      }
      resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function editableCatalog(analysis: OfferingDocumentAnalysisRecord): OfferingCatalogUpdate | null {
  const catalog = analysis.result?.catalog;
  if (!catalog) return null;
  return {
    ...(catalog.summary === undefined ? {} : { summary: catalog.summary }),
    items: catalog.items.map((item) => ({
      kind: item.kind,
      name: item.name,
      ...(item.category === undefined ? {} : { category: item.category }),
      ...(item.description === undefined ? {} : { description: item.description }),
      ...(item.priceMinor === undefined ? {} : { priceMinor: item.priceMinor }),
      currency: item.currency
    })),
    differentiators: catalog.differentiators,
    ...(catalog.priceRange === undefined ? {} : { priceRange: catalog.priceRange }),
    salesChannels: catalog.salesChannels
  };
}

function cleanOfferingCatalog(catalog: OfferingCatalogUpdate): OfferingCatalogUpdate {
  const items = (catalog.items ?? [])
    .filter((item) => item.name.trim())
    .map((item) => ({
      kind: item.kind ?? "UNSPECIFIED",
      name: item.name.trim(),
      ...(item.category?.trim() ? { category: item.category.trim() } : {}),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      ...(item.priceMinor === undefined ? {} : { priceMinor: item.priceMinor }),
      currency: item.currency.toUpperCase()
    }));
  return {
    ...(catalog.summary?.trim() ? { summary: catalog.summary.trim() } : {}),
    ...(items.length ? { items } : {}),
    differentiators: (catalog.differentiators ?? []).map((item) => item.trim()).filter(Boolean),
    ...(catalog.priceRange?.trim() ? { priceRange: catalog.priceRange.trim() } : {}),
    salesChannels: (catalog.salesChannels ?? []).map((item) => item.trim()).filter(Boolean)
  };
}

function offeringCatalogSummary(catalog: OfferingCatalogUpdate): string {
  const itemLines = (catalog.items ?? []).map((item) => [item.name, item.description].filter(Boolean).join(": "));
  return [catalog.summary, ...itemLines].filter(Boolean).join("\n").slice(0, 4000);
}

function businessProfileIsComplete(profile: BusinessProfile): boolean {
  return Boolean(profile.businessName.trim() && profileFieldKeys.every((field) => profile[field].en.trim() && profile[field].ar.trim()));
}

function initialScreen(state: OnboardingState, editMode: boolean): Screen {
  if (editMode) return "review";
  if (state.businessProfile.status === "DRAFT") return "profile";
  if (state.status === "NOT_STARTED" && !state.modules.some((module) => module.completed || module.skipped)) return "greeting";
  if (state.modules.every((module) => module.completed || module.skipped)) return "review";
  return "step";
}

function initialStep(state: OnboardingState): OnboardingStepId {
  const index = moduleOrder.findIndex((module) => {
    const moduleState = state.modules.find((item) => item.module === module);
    return !moduleState || (!moduleState.completed && !moduleState.skipped);
  });
  return (Math.min(7, Math.max(1, index + 1)) || 1) as OnboardingStepId;
}
