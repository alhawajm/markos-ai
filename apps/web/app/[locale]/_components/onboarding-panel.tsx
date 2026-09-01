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
import { MarkosApiError } from "@markos/api-client";
import type {
  BusinessProfile,
  Locale,
  OfferingCatalogUpdate,
  OfferingDocumentAnalysisRecord,
  OnboardingDocumentAnalysisRecord,
  OnboardingState
} from "@markos/shared-types";
import { initializeBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import { canRetryOfferingDocumentFailure, offeringDocumentFailureMessage } from "./offering-document-errors";
import {
  createEmptyOnboardingDraft,
  createOnboardingDraftFromDocumentProfile,
  approvedDocumentProfile,
  emptyOnboardingOffering,
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
  type OnboardingOfferingDraft,
  type OnboardingStepId
} from "./onboarding-draft";

type Screen = "documents" | "greeting" | "profile" | "review" | "step";
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

const moduleOrder = ["company", "products", "story", "audience", "competitors", "brand", "objectives"];

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
        body: "ارفع ملفاً أو ملفين، وسنستخرج ما تقدمه لتراجعه قبل الحفظ. يمكنك دائماً إدخال التفاصيل في الجدول بجانب هذه اللوحة.",
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
      businessDocuments: {
        analyze: "تحليل الملفات",
        analyzing: "يقرأ MARKOS ملفات نشاطك…",
        body: "ارفع ملفات نشاطك ليملأ MARKOS ما يستطيع العثور عليه. ستراجع كل شيء قبل الحفظ.",
        choose: "اختر الملفات",
        discard: "حذف الملفات",
        failed: "تعذر تحليل هذه الملفات الآن. حاول مجدداً أو ارفع ملفات أخرى.",
        formats: "PDF أو Word أو TXT أو PNG أو JPG أو WebP — حتى 5 ملفات",
        invalid: "اختر من ملف إلى 5 ملفات مدعومة، بحد أقصى 8 ميجابايت للملف و20 ميجابايت إجمالاً.",
        manual: "الإدخال يدوياً",
        removeSelected: "إزالة الملف",
        replace: "حذف التحليل واختيار ملفات أخرى",
        retry: "إعادة المحاولة",
        selected: "الملفات المختارة",
        title: "ابدأ من ملفات نشاطك",
        upload: "استخدام مستندات النشاط"
      },
      greeting: {
        eyebrow: "مرحباً بك في MARKOS AI",
        start: "الإدخال يدوياً",
        title: "يبدأ تسويقك بفهم نشاطك.",
        journey: ["استخدم ملفات نشاطك", "أو أجب خطوة بخطوة"]
      },
      helpTitle: "لماذا نطلب هذا؟",
      informationCheck: "فحص المعلومات",
      offerings: {
        add: "إضافة منتج أو خدمة",
        description: "وصف مختصر",
        kind: "النوع",
        name: "الاسم",
        price: "السعر (د.ب)",
        priceHint: "اتركه فارغاً إن كان السعر متغيراً أو غير معروف.",
        product: "منتج",
        remove: "إزالة",
        service: "خدمة",
        unspecified: "غير محدد"
      },
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
        save: "حفظ التغييرات",
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
      body: "Upload one or two files and review what we find before anything is saved. You can always enter details in the table beside this panel.",
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
    businessDocuments: {
      analyze: "Analyze files",
      analyzing: "MARKOS is reading your business files…",
      body: "Upload business files and MARKOS will fill whatever it can find. You review everything before it is saved.",
      choose: "Choose files",
      discard: "Discard files",
      failed: "These files could not be analyzed right now. Retry, or upload different files.",
      formats: "PDF, Word, TXT, PNG, JPG, or WebP — up to 5 files",
      invalid: "Choose one to five supported files, up to 8 MB each and 20 MB combined.",
      manual: "Enter details myself",
      removeSelected: "Remove file",
      replace: "Discard and choose different files",
      retry: "Retry",
      selected: "Selected files",
      title: "Start with your business files",
      upload: "Use business documents"
    },
    greeting: {
      eyebrow: "Welcome to MARKOS AI",
      start: "Enter details myself",
      title: "Your marketing starts with understanding your business.",
      journey: ["Use your business files", "Or answer step by step"]
    },
    helpTitle: "Why this helps",
    informationCheck: "Information check",
    offerings: {
      add: "Add an offering",
      description: "Short description",
      kind: "Type",
      name: "Name",
      price: "Price (BHD)",
      priceHint: "Leave blank when pricing varies or is not known yet.",
      product: "Product",
      remove: "Remove",
      service: "Service",
      unspecified: "Unspecified"
    },
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
      save: "Save changes",
      rows: [
        ["Business name", "Essential"],
        ["Products and services", "Essential"],
        ["Customers", "Helps personalize results"],
        ["Story and strengths", "Improves positioning"],
        ["Market context", "Optional"],
        ["Tone of voice", "Up to four words"],
        ["Current priority", "Campaigns confirm it later"]
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
      help: "The business name grounds your profile. Business type and market help Campaigns avoid generic or geographically irrelevant suggestions.",
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
      module: "products",
      label: "What you offer",
      description: "Products or services",
      title: "What do you sell or provide?",
      intro: "Add what you offer. A name is enough to start; descriptions and prices are optional.",
      help: "This is the minimum grounding MARKOS needs to describe the business and create relevant Campaigns and content.",
      icon: Layers3,
      skippable: false,
      fields: []
    },
    {
      id: 3,
      module: "story",
      label: "What makes you different",
      description: "Story and strengths",
      title: "Why should customers choose you?",
      intro: "A rough answer is useful. It does not need to sound like marketing copy.",
      help: "A differentiator and the problem you solve improve positioning, profile resolution, and Campaign rationale.",
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
      id: 4,
      module: "audience",
      label: "Your customers",
      description: "Who you want to reach",
      title: "Who usually buys from you?",
      intro: "Describe real customers in everyday language. Exact demographics are unnecessary unless they genuinely affect the work.",
      help: "Customer context helps Campaigns and Create choose more relevant messages, needs, and calls to action.",
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
      description: "Campaigns confirm it later",
      title: "What should MARKOS help with first?",
      intro: "This gives the profile useful context. Each Campaign still asks you to confirm or change its objective and duration.",
      help: "A current priority can guide the profile’s marketing focus without locking future Campaigns.",
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
      label: "ما الذي تقدمه؟",
      description: "المنتجات أو الخدمات",
      title: "ماذا تبيع أو تقدم؟",
      intro: "أضف ما تقدمه. يكفي الاسم للبدء، أما الوصف والسعر فاختياريان.",
      help: "هذه أقل معرفة يحتاجها MARKOS لوصف النشاط وإنشاء استراتيجية ومحتوى مرتبطين به.",
      fields: []
    },
    {
      ...steps[2]!,
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
  const [onboardingDocumentAnalysis, setOnboardingDocumentAnalysis] = useState<OnboardingDocumentAnalysisRecord | null>(null);
  const [onboardingDocumentBusy, setOnboardingDocumentBusy] = useState(false);
  const [onboardingDocumentMessage, setOnboardingDocumentMessage] = useState("");
  const [backGuardOpen, setBackGuardOpen] = useState(false);
  const [backGuardBusy, setBackGuardBusy] = useState(false);
  const workspaceNameApplied = useRef(false);
  const draftRef = useRef(draft);
  const stepEntryRef = useRef<{ draft: OnboardingDraft; step: OnboardingStepId } | null>(null);

  const showError = useCallback((body: string) => {
    setMessage(body);
  }, []);

  const syncOnboardingDocumentAnalysis = useCallback(
    (analysis: OnboardingDocumentAnalysisRecord) => {
      setOnboardingDocumentAnalysis(analysis);
      if (analysis.status === "READY" && analysis.result) {
        setDraft(createOnboardingDraftFromDocumentProfile(analysis.result.profile));
        setOnboardingDocumentMessage("");
        setScreen("review");
        return;
      }
      setOnboardingDocumentMessage(analysis.status === "FAILED" ? copy.businessDocuments.failed : "");
      setScreen("documents");
    },
    [copy.businessDocuments.failed]
  );

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
    if (!session) return;
    let cancelled = false;

    void client
      .offeringDocumentAnalysis()
      .then((analysis) => {
        if (!cancelled) syncDocumentAnalysis(analysis);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [client, session]);

  useEffect(() => {
    if (!session || editMode) return;
    let cancelled = false;

    void client
      .onboardingDocumentAnalysis()
      .then((analysis) => {
        if (!cancelled && analysis !== null) syncOnboardingDocumentAnalysis(analysis);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [client, editMode, session, syncOnboardingDocumentAnalysis]);

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
    if (!catalog.items?.length) {
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
      const result = await client.approveOfferingDocumentAnalysis(documentAnalysis.id, catalog, { preserveApprovedProfile: editMode });
      setRuntimeState(result.onboarding);
      setDraft((current) => ({
        ...current,
        offer: catalog.summary?.trim() || offeringCatalogSummary(catalog),
        offerings: catalogItemsAsDrafts(catalog.items ?? [])
      }));
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

  function startDocumentSetup() {
    setOnboardingDocumentMessage("");
    setScreen("documents");
  }

  async function analyzeOnboardingFiles(files: FileList | File[]) {
    if (!session) {
      setOnboardingDocumentMessage(copy.errors.session);
      return;
    }
    const prepared = prepareOnboardingDocuments(Array.from(files));
    if (!prepared.valid) {
      setOnboardingDocumentMessage(copy.businessDocuments.invalid);
      return;
    }

    setOnboardingDocumentBusy(true);
    setOnboardingDocumentMessage("");
    try {
      const payload = await Promise.all(
        prepared.files.map(async ({ file, mimeType }) => ({ filename: file.name, mimeType, base64Data: await fileAsBase64(file) }))
      );
      const analysis = await client.analyzeOnboardingDocuments(payload);
      syncOnboardingDocumentAnalysis(analysis);
    } catch (error) {
      if (error instanceof MarkosApiError && error.code === "ONBOARDING_DOCUMENT_ANALYSIS_CONFLICT") {
        const existing = await client.onboardingDocumentAnalysis().catch(() => null);
        if (existing !== null) {
          syncOnboardingDocumentAnalysis(existing);
          return;
        }
      }
      setOnboardingDocumentMessage(error instanceof Error ? error.message : copy.businessDocuments.failed);
    } finally {
      setOnboardingDocumentBusy(false);
    }
  }

  async function retryOnboardingAnalysis() {
    if (!onboardingDocumentAnalysis) return;
    setOnboardingDocumentBusy(true);
    setOnboardingDocumentMessage("");
    try {
      const analysis = await client.retryOnboardingDocumentAnalysis(onboardingDocumentAnalysis.id);
      syncOnboardingDocumentAnalysis(analysis);
    } catch (error) {
      setOnboardingDocumentMessage(error instanceof Error ? error.message : copy.businessDocuments.failed);
    } finally {
      setOnboardingDocumentBusy(false);
    }
  }

  async function discardOnboardingAnalysis(nextScreen: "documents" | "greeting") {
    if (!onboardingDocumentAnalysis) {
      setScreen(nextScreen);
      return;
    }
    setOnboardingDocumentBusy(true);
    setOnboardingDocumentMessage("");
    try {
      await client.discardOnboardingDocumentAnalysis(onboardingDocumentAnalysis.id);
      setOnboardingDocumentAnalysis(null);
      setDraft(createEmptyOnboardingDraft());
      setScreen(nextScreen);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : copy.businessDocuments.failed;
      setOnboardingDocumentMessage(nextMessage);
      if (nextScreen === "documents") showError(nextMessage);
    } finally {
      setOnboardingDocumentBusy(false);
    }
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
    if (onboardingDocumentAnalysis?.status === "READY") {
      if (step === 2) setDraft((current) => ({ ...current, offerings: current.offerings.filter((item) => item.name.trim()) }));
      advanceAfterStep();
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const payload = payloadForOnboardingStep(step, draft);
      const state = await client.saveOnboardingModule(payload.module, payload.body, { preserveApprovedProfile: editMode });
      setRuntimeState(state);
      if (step === 2) {
        setDraft((current) => ({ ...current, offerings: current.offerings.filter((item) => item.name.trim()) }));
      }
      advanceAfterStep();
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setSaving(false);
    }
  }

  async function skipStep() {
    if (!session || !activeStep.skippable) return;
    if (onboardingDocumentAnalysis?.status === "READY") {
      setDraft((current) => restoreOnboardingStep(step, createEmptyOnboardingDraft(), current));
      advanceAfterStep();
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const state = await client.skipOnboardingModule(activeStep.module, { preserveApprovedProfile: editMode });
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
    const hasOpenDocumentAnalysis = step === 2 && (documentAnalysis?.status === "READY" || documentAnalysis?.status === "FAILED");

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
      if (step === 2 && documentAnalysis && (documentAnalysis.status === "READY" || documentAnalysis.status === "FAILED")) {
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

  async function approveOnboardingDocumentsAndGenerateProfile() {
    const analysis = onboardingDocumentAnalysis;
    if (!analysis?.result) return;
    const companyReady = draft.businessName.trim().length >= 2;
    const offeringsReady = draft.offerings.some((item) => item.name.trim());
    if (!companyReady || !offeringsReady) {
      showError(companyReady ? copy.errors.products : copy.errors.company);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const result = await client.approveOnboardingDocumentAnalysis(analysis.id, approvedDocumentProfile(draft, analysis.result.profile));
      setRuntimeState(result.onboarding);
      setOnboardingDocumentAnalysis(result.analysis);
      await generateProfile();
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.save);
    } finally {
      setSaving(false);
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
      router.push(`/${locale}/app/campaigns`);
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.errors.approve);
      setSaving(false);
    }
  }

  function finishEditMode() {
    if (!session) {
      showError(copy.errors.session);
      return;
    }

    setSaving(true);
    setMessage("");
    window.localStorage.removeItem(onboardingDraftKey);
    router.push(`/${locale}/app/knowledge`);
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
            {screen === "step"
              ? copy.step(step, 7)
              : screen === "review"
                ? copy.informationCheck
                : screen === "documents"
                  ? copy.businessDocuments.analyze
                  : copy.profile.eyebrow}
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
          {screen === "greeting" ? <Greeting copy={copy} onDocuments={startDocumentSetup} onStart={startSetup} /> : null}
          {screen === "documents" ? (
            <BusinessDocumentScreen
              analysis={onboardingDocumentAnalysis}
              busy={onboardingDocumentBusy}
              copy={copy}
              message={onboardingDocumentMessage}
              onAnalyze={(files) => void analyzeOnboardingFiles(files)}
              onBack={() => setScreen("greeting")}
              onDiscard={() => void discardOnboardingAnalysis("documents")}
              onManual={startSetup}
              onRetry={() => void retryOnboardingAnalysis()}
            />
          ) : null}
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
              editMode={editMode}
              documentAnalysis={onboardingDocumentAnalysis}
              locale={locale}
              onBack={() => {
                setStep(7);
                setScreen("step");
              }}
              onCreate={() =>
                void (editMode
                  ? finishEditMode()
                  : onboardingDocumentAnalysis?.status === "READY"
                    ? approveOnboardingDocumentsAndGenerateProfile()
                    : generateProfile())
              }
              onDiscardDocumentAnalysis={() => void discardOnboardingAnalysis("documents")}
              onEdit={editReviewStep}
              readyForProfile={runtimeState.readyForProfile || (draft.businessName.trim().length >= 2 && hasOnboardingStepData(2, draft))}
              saving={profileLoading || saving}
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

function Greeting({ copy, onDocuments, onStart }: { copy: OnboardingCopy; onDocuments: () => void; onStart: () => void }) {
  return (
    <section className="mx-auto grid min-h-[calc(100vh-96px)] w-full max-w-6xl place-items-center px-5 pb-[clamp(5rem,12vh,9rem)] pt-2 sm:px-8">
      <div className="w-full max-w-5xl text-center">
        <p className="text-[15px] font-bold uppercase tracking-[.11em] text-[var(--sunlit-pink)] sm:text-[16px]">{copy.greeting.eyebrow}</p>
        <h1 className="mx-auto mt-3 max-w-4xl font-display text-[clamp(46px,5.4vw,74px)] font-bold leading-[1.01] tracking-[-0.052em] text-[var(--sunlit-ink)] rtl:tracking-normal">
          {copy.greeting.title}
        </h1>

        <div className="mx-auto mt-10 grid max-w-4xl gap-4 text-start md:grid-cols-2">
          <button
            className="group relative min-h-48 overflow-hidden rounded-[1.8rem] bg-[var(--sunlit-ink)] p-6 text-start text-white shadow-[0_24px_60px_rgb(32_33_43_/_24%)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_30px_72px_rgb(32_33_43_/_28%)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--sunlit-aqua)] sm:p-7"
            onClick={onDocuments}
            type="button"
          >
            <span
              aria-hidden="true"
              className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[var(--sunlit-aqua)] opacity-20 blur-2xl rtl:-left-12 rtl:right-auto"
            />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-[var(--sunlit-yellow)] ring-1 ring-white/15">
              <UploadCloud size={22} />
            </span>
            <span className="relative mt-7 block text-[14px] font-bold text-white/64">{copy.greeting.journey[0]}</span>
            <span className="relative mt-1 flex items-end justify-between gap-5">
              <strong className="max-w-sm text-[clamp(23px,2.5vw,30px)] font-bold leading-tight tracking-[-0.025em]">{copy.businessDocuments.upload}</strong>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--sunlit-yellow)] text-[var(--sunlit-ink)] transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                <ArrowRight className="rtl:rotate-180" size={20} />
              </span>
            </span>
          </button>
          <button
            className="group relative min-h-48 overflow-hidden rounded-[1.8rem] border border-[rgb(255_105_97_/_28%)] bg-[linear-gradient(145deg,rgb(255_255_255_/_94%),rgb(255_240_234_/_92%))] p-6 text-start shadow-[0_20px_50px_rgb(255_105_97_/_14%)] transition duration-200 hover:-translate-y-1 hover:border-[rgb(255_105_97_/_48%)] hover:shadow-[0_28px_64px_rgb(255_105_97_/_19%)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--sunlit-pink)] sm:p-7"
            onClick={onStart}
            type="button"
          >
            <span
              aria-hidden="true"
              className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[var(--sunlit-yellow)] opacity-25 blur-2xl rtl:-right-16 rtl:left-auto"
            />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sunlit-pink-soft)] text-[var(--sunlit-pink)] ring-1 ring-[rgb(255_105_97_/_15%)]">
              <Pencil size={21} />
            </span>
            <span className="relative mt-7 block text-[14px] font-bold text-[var(--sunlit-muted)]">{copy.greeting.journey[1]}</span>
            <span className="relative mt-1 flex items-end justify-between gap-5">
              <strong className="max-w-sm text-[clamp(23px,2.5vw,30px)] font-bold leading-tight tracking-[-0.025em] text-[var(--sunlit-ink)]">
                {copy.greeting.start}
              </strong>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--sunlit-pink)] text-white transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                <ArrowRight className="rtl:rotate-180" size={20} />
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function BusinessDocumentScreen({
  analysis,
  busy,
  copy,
  message,
  onAnalyze,
  onBack,
  onDiscard,
  onManual,
  onRetry
}: {
  analysis: OnboardingDocumentAnalysisRecord | null;
  busy: boolean;
  copy: OnboardingCopy;
  message: string;
  onAnalyze: (files: File[]) => void;
  onBack: () => void;
  onDiscard: () => void;
  onManual: () => void;
  onRetry: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectionMessage, setSelectionMessage] = useState("");
  const waiting = busy || analysis?.status === "PROCESSING";
  const failed = analysis?.status === "FAILED";
  const displayedMessage = selectionMessage || message || (failed ? copy.businessDocuments.failed : "");

  function stageFiles(files: File[]) {
    const merged = [...selectedFiles];
    const selectedKeys = new Set(merged.map((file) => stagedFileKey(file)));
    for (const file of files) {
      const key = stagedFileKey(file);
      if (!selectedKeys.has(key)) {
        merged.push(file);
        selectedKeys.add(key);
      }
    }

    const prepared = prepareOnboardingDocuments(merged);
    if (!prepared.valid) {
      setSelectionMessage(copy.businessDocuments.invalid);
      return;
    }
    setSelectedFiles(prepared.files.map(({ file }) => file));
    setSelectionMessage("");
  }

  return (
    <section className="mx-auto grid min-h-[calc(100vh-105px)] w-full max-w-5xl place-items-center px-5 pb-12 sm:px-8">
      <article className="sunlit-panel w-full max-w-3xl rounded-[2rem] bg-white/92 p-7 backdrop-blur-xl sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sunlit-yellow-soft)] text-[var(--sunlit-warning)]">
          <FileText size={23} />
        </span>
        <h1 className="mt-5 font-display text-[32px] font-bold tracking-tight sm:text-[38px]">{copy.businessDocuments.title}</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[var(--sunlit-ink-soft)]">{copy.businessDocuments.body}</p>

        <button
          className="mt-7 flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] px-6 py-8 text-center transition hover:border-[var(--sunlit-aqua-dark)] hover:bg-white disabled:cursor-wait disabled:opacity-60"
          disabled={waiting || failed}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {waiting ? (
            <LoaderCircle className="animate-spin text-[var(--sunlit-aqua-dark)]" size={28} />
          ) : (
            <UploadCloud className="text-[var(--sunlit-aqua-dark)]" size={28} />
          )}
          <strong className="mt-3 text-[16px]">{waiting ? copy.businessDocuments.analyzing : copy.businessDocuments.choose}</strong>
          <span className="mt-1 text-[14px] text-[var(--sunlit-muted)]">{copy.businessDocuments.formats}</span>
        </button>
        <input
          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={waiting || failed}
          multiple
          onChange={(event) => {
            if (event.target.files?.length) stageFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />

        {selectedFiles.length && !failed ? (
          <section aria-label={copy.businessDocuments.selected} className="mt-4 rounded-2xl border border-[var(--sunlit-line)] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-bold text-[var(--sunlit-ink)]">{copy.businessDocuments.selected}</h2>
              <span className="rounded-full bg-[var(--sunlit-aqua-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--sunlit-aqua-dark)]">
                {selectedFiles.length}/5
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {selectedFiles.map((file, index) => (
                <div
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] px-3 py-2.5"
                  key={`${file.name}-${file.size}-${index}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--sunlit-aqua-dark)] shadow-sm">
                    <FileText size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-[var(--sunlit-ink)]" title={file.name}>
                      {documentDisplayName(file.name)}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-[.08em] text-[var(--sunlit-muted)]">
                      {documentTypeLabel(file.name)}
                    </span>
                  </span>
                  <button
                    aria-label={`${copy.businessDocuments.removeSelected}: ${file.name}`}
                    className="rounded-lg p-1.5 text-[var(--sunlit-muted)] hover:bg-white hover:text-[var(--sunlit-danger)] disabled:opacity-50"
                    disabled={waiting}
                    onClick={() => {
                      setSelectedFiles((current) => current.filter((_item, fileIndex) => fileIndex !== index));
                      setSelectionMessage("");
                    }}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--sunlit-line)] pt-4">
              <button
                className="sunlit-secondary rounded-xl px-4 py-2.5 text-[13px] font-bold"
                disabled={waiting}
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                {copy.businessDocuments.choose}
              </button>
              <button
                className="sunlit-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={waiting || !selectedFiles.length}
                onClick={() => onAnalyze(selectedFiles)}
                type="button"
              >
                {waiting ? <LoaderCircle className="animate-spin" size={17} /> : <WandSparkles size={17} />}
                {waiting ? copy.businessDocuments.analyzing : copy.businessDocuments.analyze}
              </button>
            </div>
          </section>
        ) : null}

        {displayedMessage ? (
          <div className="mt-4 rounded-xl border border-[rgb(199_53_80_/_20%)] bg-[rgb(255_244_246_/_88%)] p-4 text-[14px] leading-6 text-[var(--sunlit-ink-soft)]">
            {displayedMessage}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sunlit-line)] pt-5">
          <button className="sunlit-secondary rounded-xl px-5 py-3 text-[14px] font-bold" disabled={waiting} onClick={onBack} type="button">
            {copy.back}
          </button>
          {failed ? (
            <div className="flex gap-2">
              <button
                className="sunlit-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold"
                disabled={busy}
                onClick={onDiscard}
                type="button"
              >
                <Trash2 size={16} /> {copy.businessDocuments.discard}
              </button>
              <button
                className="sunlit-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold"
                disabled={busy}
                onClick={onRetry}
                type="button"
              >
                <RefreshCw size={16} /> {copy.businessDocuments.retry}
              </button>
            </div>
          ) : (
            <button
              className="rounded-xl px-5 py-3 text-[14px] font-bold text-[var(--sunlit-muted)] hover:bg-[var(--sunlit-paper)]"
              disabled={waiting}
              onClick={onManual}
              type="button"
            >
              {copy.businessDocuments.manual}
            </button>
          )}
        </div>
      </article>
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
  const hasActiveDocumentAnalysis =
    documentBusy || documentAnalysis?.status === "PROCESSING" || documentAnalysis?.status === "READY" || documentAnalysis?.status === "FAILED";

  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 pb-8 sm:px-8 lg:pb-6">
      <div className="mb-4 grid grid-cols-[1fr_1.25fr_1fr] gap-2 sm:gap-3">
        <ContextItem label={copy.previous} muted title={previous?.label ?? ""} />
        <ContextItem current label={copy.step(step.id, 7)} title={step.label} />
        <ContextItem label={copy.next} muted title={next?.label ?? copy.informationCheck} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="sunlit-panel flex min-h-[610px] min-w-0 flex-col overflow-hidden rounded-[2rem] bg-white/90 backdrop-blur-xl">
          <div className="h-1.5 shrink-0 bg-[var(--sunlit-paper-deep)]">
            <div
              className="h-full rounded-e-full bg-[linear-gradient(90deg,var(--sunlit-coral),var(--sunlit-yellow))] transition-[width] duration-300"
              style={{ width: `${(step.id / 7) * 100}%` }}
            />
          </div>
          <div className="min-w-0 flex-1 p-6 sm:p-8 lg:p-10">
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

            {step.fields.length ? (
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
            ) : null}

            {step.id === 6 ? <BusinessColorEditor colors={draft.colors} locale={locale} onChange={(colors) => update("colors", colors)} /> : null}

            {step.id === 2 && hasActiveDocumentAnalysis ? (
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

            {step.id === 2 ? (
              <div className="mt-7">
                <OfferingEditor copy={copy} items={draft.offerings} onItemsChange={(items) => update("offerings", items)} />
              </div>
            ) : null}

            {validationIssue ? <p className="mt-4 text-[14px] font-semibold text-[var(--sunlit-danger)]">{copy.errors[validationIssue]}</p> : null}
          </div>

          <div className="mt-auto flex flex-col-reverse gap-3 border-t border-[var(--sunlit-line)] bg-white/65 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
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

        <aside className="self-start rounded-2xl border border-[rgb(33_191_174_/_22%)] bg-[var(--sunlit-aqua-soft)]/70 p-5 lg:sticky lg:top-5">
          <div className="flex items-center gap-2 text-[15px] font-bold text-[var(--sunlit-aqua-dark)]">
            <Info size={17} />
            {copy.helpTitle}
          </div>
          <p className="mt-3 text-[15px] leading-6 text-[var(--sunlit-ink-soft)]">{step.help}</p>
          <div className="mt-5 flex items-center gap-2 border-t border-[rgb(33_191_174_/_18%)] pt-4 text-[13px] font-bold text-[var(--sunlit-muted)]">
            {step.skippable ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
            {step.skippable ? copy.optional : copy.essential}
          </div>
          {step.id === 2 ? (
            <OfferingDocumentLauncher
              analysis={documentAnalysis}
              busy={documentBusy}
              copy={copy}
              locale={locale}
              message={documentMessage}
              onAnalyze={onAnalyzeDocuments}
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function BusinessColorEditor({ colors, locale, onChange }: { colors: string[]; locale: Locale; onChange: (colors: string[]) => void }) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const [pendingColor, setPendingColor] = useState("#21BFAE");
  const [hasPendingColor, setHasPendingColor] = useState(false);
  const label = locale === "ar" ? "ألوان النشاط" : "Business colors";
  const hint = locale === "ar" ? "اختر حتى 7 ألوان. اضغط على أي لون لتعديله." : "Choose up to 7 colors. Select any swatch to edit it.";
  const choose = locale === "ar" ? "اختيار لون" : "Choose color";
  const add = locale === "ar" ? "إضافة اللون المختار" : "Add selected color";
  const selected = locale === "ar" ? "اللون المختار" : "Selected color";
  const remove = locale === "ar" ? "إزالة اللون" : "Remove color";

  function replaceColor(index: number, value: string) {
    const normalized = value.toUpperCase();
    if (colors.some((color, colorIndex) => colorIndex !== index && color === normalized)) return;
    onChange(colors.map((color, colorIndex) => (colorIndex === index ? normalized : color)));
  }

  function addColor(value: string) {
    const normalized = value.toUpperCase();
    if (colors.length >= 7 || colors.includes(normalized)) return;
    onChange([...colors, normalized]);
    setHasPendingColor(false);
  }

  return (
    <section className="mt-5 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--sunlit-ink)]">{label}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--sunlit-muted)]">{hint}</p>
        </div>
        {colors.length < 7 ? (
          <button
            className="sunlit-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold"
            onClick={() => addInputRef.current?.click()}
            type="button"
          >
            <Plus size={15} /> {choose}
          </button>
        ) : null}
      </div>
      <input
        aria-label={choose}
        className="sr-only"
        onChange={(event) => {
          setPendingColor(event.target.value.toUpperCase());
          setHasPendingColor(true);
        }}
        ref={addInputRef}
        type="color"
        value={pendingColor}
      />
      {hasPendingColor && colors.length < 7 ? (
        <div aria-live="polite" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(33_191_174_/_24%)] bg-white p-3">
          <button
            aria-label={choose}
            className="h-10 w-10 rounded-lg shadow-sm ring-1 ring-black/10"
            onClick={() => addInputRef.current?.click()}
            style={{ backgroundColor: pendingColor }}
            type="button"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[.08em] text-[var(--sunlit-muted)]">{selected}</span>
            <code className="mt-0.5 block text-[14px] font-bold text-[var(--sunlit-ink-soft)]">{pendingColor}</code>
          </span>
          <button
            className="sunlit-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
            disabled={colors.includes(pendingColor)}
            onClick={() => addColor(pendingColor)}
            type="button"
          >
            <Plus size={15} /> {add}
          </button>
        </div>
      ) : null}
      {colors.length ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {colors.map((color, index) => (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--sunlit-line)] bg-white p-2" key={`${color}-${index}`}>
              <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-lg shadow-sm ring-1 ring-black/10" style={{ backgroundColor: color }}>
                <span className="sr-only">{color}</span>
                <input
                  aria-label={`${label} ${index + 1}`}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={(event) => replaceColor(index, event.target.value)}
                  type="color"
                  value={color}
                />
              </label>
              <code className="text-[13px] font-bold text-[var(--sunlit-ink-soft)]">{color}</code>
              <button
                aria-label={remove}
                className="rounded-lg p-1.5 text-[var(--sunlit-muted)] hover:bg-[rgb(199_53_80_/_8%)] hover:text-[var(--sunlit-danger)]"
                onClick={() => onChange(colors.filter((_item, colorIndex) => colorIndex !== index))}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OfferingEditor({
  copy,
  items,
  onItemsChange
}: {
  copy: OnboardingCopy;
  items: OnboardingOfferingDraft[];
  onItemsChange: (items: OnboardingOfferingDraft[]) => void;
}) {
  function updateItem(index: number, patch: Partial<OnboardingOfferingDraft>) {
    onItemsChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateItemPrice(index: number, priceMinor: number | undefined) {
    onItemsChange(
      items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (priceMinor !== undefined) return { ...item, priceMinor };
        const { priceMinor: _removed, ...withoutPrice } = item;
        return withoutPrice;
      })
    );
  }

  function removeItem(index: number) {
    const next = items.filter((_item, itemIndex) => itemIndex !== index);
    onItemsChange(next.length ? next : [emptyOnboardingOffering()]);
  }

  return (
    <section aria-label={copy.offerings.add} className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4 sm:p-5">
      <div className="onboarding-offering-table overflow-x-auto pb-1">
        <div className="min-w-[790px]">
          <div className="grid grid-cols-[120px_minmax(170px,1fr)_minmax(230px,1.35fr)_150px_42px] gap-2 px-1 pb-2 text-[12px] font-bold uppercase tracking-[.06em] text-[var(--sunlit-muted)]">
            <span>{copy.offerings.kind}</span>
            <span>{copy.offerings.name}</span>
            <span>{copy.offerings.description}</span>
            <span>{copy.offerings.price}</span>
            <span />
          </div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                className="grid grid-cols-[120px_minmax(170px,1fr)_minmax(230px,1.35fr)_150px_42px] items-center gap-2 rounded-xl border border-[var(--sunlit-line)] bg-white p-2"
                key={index}
              >
                <select
                  aria-label={`${copy.offerings.kind} ${index + 1}`}
                  className="sunlit-field min-h-11 rounded-lg px-3 text-[14px] outline-none"
                  name={`onboarding-offering-${index}-kind`}
                  onChange={(event) => updateItem(index, { kind: event.target.value as OnboardingOfferingDraft["kind"] })}
                  value={item.kind}
                >
                  <option value="UNSPECIFIED">{copy.offerings.unspecified}</option>
                  <option value="PRODUCT">{copy.offerings.product}</option>
                  <option value="SERVICE">{copy.offerings.service}</option>
                </select>
                <input
                  aria-label={`${copy.offerings.name} ${index + 1}`}
                  className="sunlit-field onboarding-single-line-field min-h-11 rounded-lg px-3 text-[14px] outline-none"
                  dir="auto"
                  maxLength={160}
                  name={`onboarding-offering-${index}-name`}
                  onChange={(event) => updateItem(index, { name: event.target.value })}
                  value={item.name}
                />
                <input
                  aria-label={`${copy.offerings.description} ${index + 1}`}
                  className="sunlit-field onboarding-single-line-field min-h-11 rounded-lg px-3 text-[14px] outline-none"
                  dir="auto"
                  maxLength={1000}
                  name={`onboarding-offering-${index}-description`}
                  onChange={(event) => updateItem(index, { description: event.target.value })}
                  value={item.description}
                />
                <OfferingPriceInput
                  ariaLabel={`${copy.offerings.price} ${index + 1}`}
                  name={`onboarding-offering-${index}-price`}
                  onChange={(priceMinor) => updateItemPrice(index, priceMinor)}
                  priceMinor={item.priceMinor}
                />
                <button
                  aria-label={`${copy.offerings.remove} ${item.name || index + 1}`}
                  className="grid h-10 w-10 place-items-center rounded-lg text-[var(--sunlit-muted)] hover:bg-[rgb(199_53_80_/_7%)] hover:text-[var(--sunlit-danger)]"
                  onClick={() => removeItem(index)}
                  type="button"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-bold text-[var(--sunlit-aqua-dark)] hover:bg-[var(--sunlit-aqua-soft)]"
          disabled={items.length >= 30}
          onClick={() => onItemsChange([...items, emptyOnboardingOffering()])}
          type="button"
        >
          <Plus size={16} />
          {copy.offerings.add}
        </button>
        <p className="text-[13px] text-[var(--sunlit-muted)]">{copy.offerings.priceHint}</p>
      </div>
    </section>
  );
}

function OfferingPriceInput({
  ariaLabel,
  name,
  onChange,
  priceMinor
}: {
  ariaLabel: string;
  name: string;
  onChange: (priceMinor: number | undefined) => void;
  priceMinor: number | undefined;
}) {
  const [value, setValue] = useState(() => formatBhdPrice(priceMinor));

  useEffect(() => {
    const activeName = document.activeElement?.getAttribute("name");
    if (activeName !== name) setValue(formatBhdPrice(priceMinor));
  }, [name, priceMinor]);

  return (
    <input
      aria-label={ariaLabel}
      className="sunlit-field onboarding-single-line-field min-h-11 rounded-lg px-3 text-[14px] outline-none"
      inputMode="decimal"
      name={name}
      onBlur={() => setValue(formatBhdPrice(priceMinor))}
      onChange={(event) => {
        const next = event.target.value.replace(",", ".");
        if (!/^\d*(?:\.\d{0,3})?$/.test(next)) return;
        setValue(next);
        if (!next || next === ".") {
          onChange(undefined);
          return;
        }
        const amount = Number(next);
        if (Number.isFinite(amount)) onChange(Math.round(amount * 1000));
      }}
      placeholder="0.000"
      value={value}
    />
  );
}

function formatBhdPrice(priceMinor: number | undefined): string {
  if (priceMinor === undefined) return "";
  return (priceMinor / 1000).toFixed(3);
}

function catalogItemsAsDrafts(items: NonNullable<OfferingCatalogUpdate["items"]>): OnboardingOfferingDraft[] {
  if (!items.length) return [emptyOnboardingOffering()];
  return items.map((item) => ({
    ...(item.category ? { category: item.category } : {}),
    currency: "BHD",
    description: item.description ?? "",
    kind: item.kind ?? "UNSPECIFIED",
    name: item.name,
    ...(item.priceMinor === undefined ? {} : { priceMinor: item.priceMinor })
  }));
}

function OfferingDocumentLauncher({
  analysis,
  busy,
  copy,
  locale,
  message,
  onAnalyze
}: {
  analysis: OfferingDocumentAnalysisRecord | null;
  busy: boolean;
  copy: OnboardingCopy;
  locale: Locale;
  message: string;
  onAnalyze: (files: FileList | File[]) => void;
}) {
  const waiting = busy || analysis?.status === "PROCESSING";
  const active = waiting || analysis?.status === "READY" || analysis?.status === "FAILED";

  return (
    <section className="mt-5 border-t border-[rgb(33_191_174_/_18%)] pt-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sunlit-yellow-soft)] text-[var(--sunlit-warning)]">
          <FileText size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[var(--sunlit-ink)]">{copy.documents.title}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--sunlit-ink-soft)]">{copy.documents.body}</p>
        </div>
      </div>

      {!active ? (
        <label
          className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[rgb(33_191_174_/_48%)] bg-white/80 px-3 py-3 text-[13px] font-bold text-[var(--sunlit-aqua-dark)] hover:border-[var(--sunlit-aqua)] hover:bg-white"
          onDragOver={(event: DragEvent<HTMLLabelElement>) => event.preventDefault()}
          onDrop={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            onAnalyze(event.dataTransfer.files);
          }}
        >
          <UploadCloud className="shrink-0" size={18} />
          <span>{copy.documents.choose}</span>
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
      ) : waiting ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-3 text-[13px] font-bold text-[var(--sunlit-ink-soft)]">
          <LoaderCircle className="animate-spin text-[var(--sunlit-aqua-dark)]" size={17} />
          {copy.documents.analyzing}
        </div>
      ) : (
        <button
          className="sunlit-secondary mt-3 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-start text-[13px] font-bold"
          onClick={() => document.getElementById("offering-document-review")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          type="button"
        >
          <span>{analysis?.status === "READY" ? copy.documents.reviewTitle : offeringDocumentFailureMessage(locale, analysis?.failureCode)}</span>
          <ArrowRight className="shrink-0 rtl:rotate-180" size={15} />
        </button>
      )}

      {!active && message ? <p className="mt-2 text-[12px] font-semibold leading-5 text-[var(--sunlit-danger)]">{message}</p> : null}
      {!active ? <p className="mt-2 text-[12px] leading-5 text-[var(--sunlit-muted)]">{copy.documents.expires}</p> : null}
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

  const waiting = busy || analysis?.status === "PROCESSING";
  const canRetry = canRetryOfferingDocumentFailure(analysis?.failureCode);

  return (
    <section className="mt-7 scroll-mt-5 overflow-hidden rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)]" id="offering-document-review">
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

          <div className="mt-4">
            <OfferingEditor copy={copy} items={catalogItemsAsDrafts(items)} onItemsChange={(nextItems) => onCatalogChange({ ...catalog, items: nextItems })} />
          </div>

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
          className={`${inputClass} onboarding-prose-field h-28 w-full resize-none`}
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
  documentAnalysis,
  editMode,
  locale,
  onBack,
  onCreate,
  onDiscardDocumentAnalysis,
  onEdit,
  readyForProfile,
  saving
}: {
  copy: OnboardingCopy;
  draft: OnboardingDraft;
  documentAnalysis: OnboardingDocumentAnalysisRecord | null;
  editMode: boolean;
  locale: Locale;
  onBack: () => void;
  onCreate: () => void;
  onDiscardDocumentAnalysis: () => void;
  onEdit: (step: OnboardingStepId) => void;
  readyForProfile: boolean;
  saving: boolean;
}) {
  const targets: OnboardingStepId[] = [1, 2, 4, 3, 5, 6, 7];
  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 pb-10 sm:px-8">
      <section className="sunlit-panel rounded-[2rem] bg-white/92 p-6 backdrop-blur-xl sm:p-9 lg:p-10">
        <div className="max-w-4xl">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
            <ShieldCheck size={23} />
          </span>
          <h1 className="mt-5 font-display text-[32px] font-bold leading-tight tracking-tight sm:text-[38px]">{copy.review.title}</h1>
          <p className="mt-3 text-[16px] leading-7 text-[var(--sunlit-ink-soft)]">{copy.review.body}</p>
        </div>

        {documentAnalysis?.status === "READY" && documentAnalysis.result ? (
          <div className="mt-6 rounded-2xl border border-[rgb(33_191_174_/_22%)] bg-[var(--sunlit-aqua-soft)]/55 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong className="text-[15px] text-[var(--sunlit-aqua-dark)]">
                {locale === "ar" ? "معلومات مستخرجة من ملفاتك" : "Information found in your files"}
              </strong>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-bold text-[var(--sunlit-muted)]">
                  {documentAnalysis.files.length} {locale === "ar" ? "ملف" : documentAnalysis.files.length === 1 ? "file" : "files"}
                </span>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-[var(--sunlit-danger)] transition hover:bg-white/80 disabled:opacity-50"
                  disabled={saving}
                  onClick={onDiscardDocumentAnalysis}
                  type="button"
                >
                  <Trash2 size={14} /> {copy.businessDocuments.replace}
                </button>
              </div>
            </div>
            {documentAnalysis.result.issues.length ? (
              <ul className="mt-3 space-y-1.5 text-[14px] leading-6 text-[var(--sunlit-ink-soft)]">
                {documentAnalysis.result.issues.slice(0, 4).map((issue, index) => (
                  <li className="flex gap-2" key={`${issue.code}-${index}`}>
                    <Info className="mt-1 shrink-0 text-[var(--sunlit-warning)]" size={15} />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] leading-6 text-[var(--sunlit-ink-soft)]">
                {locale === "ar" ? "راجع الأقسام أدناه وعدّل أي معلومة قبل الحفظ." : "Review each section below and edit anything before it is saved."}
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-7 grid gap-3 md:grid-cols-2">
          {copy.review.rows.map(([title, note], index) => {
            const target = targets[index]!;
            const ready = hasOnboardingStepData(target, draft) && validateOnboardingStep(target, draft) === null;
            const required = target === 1 || target === 2;
            return (
              <button
                className={`group flex w-full items-center justify-between gap-4 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] px-5 py-4 text-start transition hover:-translate-y-0.5 hover:border-[rgb(33_191_174_/_32%)] hover:bg-white hover:shadow-sm ${index === copy.review.rows.length - 1 ? "md:col-span-2" : ""}`}
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
            {saving ? <LoaderCircle className="animate-spin" size={17} /> : editMode ? <Check size={17} /> : <WandSparkles size={17} />}
            {readyForProfile ? (editMode ? copy.review.save : copy.review.create) : copy.review.missingEssential}
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
                className="onboarding-prose-field mt-3 h-28 w-full resize-none bg-transparent text-[16px] leading-7 outline-none"
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
type OnboardingDocumentMimeType = OfferingDocumentMimeType | "image/jpeg" | "image/png" | "image/webp";

function prepareOnboardingDocuments(files: File[]): { valid: true; files: Array<{ file: File; mimeType: OnboardingDocumentMimeType }> } | { valid: false } {
  if (files.length < 1 || files.length > 5) return { valid: false };

  let totalBytes = 0;
  const prepared: Array<{ file: File; mimeType: OnboardingDocumentMimeType }> = [];
  for (const file of files) {
    const extension = file.name.toLocaleLowerCase().match(/\.[^.]+$/)?.[0];
    const mimeType: OnboardingDocumentMimeType | undefined =
      extension === ".pdf"
        ? "application/pdf"
        : extension === ".docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : extension === ".txt"
            ? "text/plain"
            : extension === ".png"
              ? "image/png"
              : extension === ".jpg" || extension === ".jpeg"
                ? "image/jpeg"
                : extension === ".webp"
                  ? "image/webp"
                  : undefined;
    totalBytes += file.size;
    if (!mimeType || file.name.length > 180 || file.size < 1 || file.size > 8_000_000) return { valid: false };
    prepared.push({ file, mimeType });
  }

  return totalBytes <= 20_000_000 ? { valid: true, files: prepared } : { valid: false };
}

function documentDisplayName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function documentTypeLabel(filename: string): string {
  const extension = filename.toLocaleLowerCase().match(/\.([^.]+)$/)?.[1];
  if (extension === "docx") return "Word";
  if (extension === "jpeg") return "JPG";
  return extension?.toUpperCase() ?? "File";
}

function stagedFileKey(file: File): string {
  return `${file.name.toLocaleLowerCase()}-${file.size}-${file.lastModified}`;
}

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
