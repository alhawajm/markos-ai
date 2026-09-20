import type { BusinessKnowledgeModule, Locale } from "@markos/shared-types";

export type ProfileTab = "marketing-strategy" | "products-services" | "audience-market" | "brand-voice" | "business";
export const profileTabs: Array<{ id: ProfileTab; label: [string, string] }> = [
  { id: "marketing-strategy", label: ["Marketing Strategy", "الاستراتيجية التسويقية"] },
  { id: "products-services", label: ["Products & Services", "المنتجات والخدمات"] },
  { id: "audience-market", label: ["Audience & Market", "الجمهور والسوق"] },
  { id: "brand-voice", label: ["Brand & Voice", "الهوية والأسلوب"] },
  { id: "business", label: ["Business", "النشاط"] }
];
export const profileText = (label: readonly [string, string], locale: Locale) => label[locale === "ar" ? 1 : 0];
export const profileTab = (value: string | null): ProfileTab => profileTabs.find((tab) => tab.id === value)?.id ?? "marketing-strategy";
export interface ProfileField {
  key: string;
  label: [string, string];
  kind?: "long" | "list" | "colors" | "url" | "email" | "stage" | "competitors" | "targets" | "asset";
  max?: number;
  required?: boolean;
}
export interface ProfileSection {
  id: string;
  tab: ProfileTab;
  module: BusinessKnowledgeModule;
  title: [string, string];
  fields: ProfileField[];
}
export const establishmentOptions = [
  ["UNSPECIFIED", "Not specified", "غير محدد"],
  ["PRE_LAUNCH", "Preparing to launch", "قيد التحضير"],
  ["NEW", "Newly operating", "حديث التأسيس"],
  ["ESTABLISHED", "Established", "راسخ"]
] as const;
export const profileSections: ProfileSection[] = [
  {
    id: "strategy",
    tab: "marketing-strategy",
    module: "objectives",
    title: ["Current strategy", "الاستراتيجية الحالية"],
    fields: [
      { key: "currentPriority", label: ["Current priority", "الأولوية الحالية"], kind: "long", max: 1000 },
      { key: "contentDirection", label: ["Content direction", "توجه المحتوى"], kind: "long", max: 2000 },
      { key: "goals", label: ["Marketing objectives", "الأهداف التسويقية"], kind: "list" }
    ]
  },
  {
    id: "success",
    tab: "marketing-strategy",
    module: "objectives",
    title: ["Goals & measures", "الأهداف والمقاييس"],
    fields: [
      { key: "success90Days", label: ["Success in 90 days", "النجاح خلال ٩٠ يوماً"], kind: "long", max: 1000 },
      { key: "kpiTargets", label: ["Performance targets", "مستهدفات الأداء"], kind: "targets" }
    ]
  },
  {
    id: "approach",
    tab: "marketing-strategy",
    module: "objectives",
    title: ["Marketing context", "السياق التسويقي"],
    fields: [
      { key: "budgetRange", label: ["Marketing budget", "ميزانية التسويق"], max: 120 },
      { key: "instagramExperience", label: ["Instagram experience", "الخبرة في إنستغرام"], max: 120 }
    ]
  },
  {
    id: "customers",
    tab: "audience-market",
    module: "audience",
    title: ["Your customers", "عملاؤك"],
    fields: [
      { key: "demographics", label: ["Target audience", "الجمهور المستهدف"], kind: "long", max: 1000 },
      { key: "ageRange", label: ["Age range", "الفئة العمرية"], max: 80 },
      { key: "genderBreakdown", label: ["Audience composition", "تكوين الجمهور"], max: 120 },
      { key: "locations", label: ["Locations", "المناطق"], kind: "list" }
    ]
  },
  {
    id: "needs",
    tab: "audience-market",
    module: "audience",
    title: ["Needs & interests", "الاحتياجات والاهتمامات"],
    fields: [
      { key: "interests", label: ["Interests", "الاهتمامات"], kind: "list" },
      { key: "motivations", label: ["Motivations", "الدوافع"], kind: "list" },
      { key: "painPoints", label: ["Customer needs", "احتياجات العملاء"], kind: "list" }
    ]
  },
  {
    id: "market",
    tab: "audience-market",
    module: "competitors",
    title: ["Market & positioning", "السوق والتموضع"],
    fields: [
      { key: "marketContext", label: ["Market context", "سياق السوق"], kind: "long", max: 2000 },
      { key: "competitiveAdvantage", label: ["Competitive advantage", "الميزة التنافسية"], kind: "long", max: 1000 },
      { key: "doDifferently", label: ["What to do differently", "ما نريد تقديمه بشكل مختلف"], kind: "long", max: 1000 }
    ]
  },
  {
    id: "competitors",
    tab: "audience-market",
    module: "competitors",
    title: ["Competitors", "المنافسون"],
    fields: [{ key: "items", label: ["Competitors", "المنافسون"], kind: "competitors" }]
  },
  {
    id: "identity",
    tab: "brand-voice",
    module: "brand",
    title: ["Brand identity", "هوية العلامة"],
    fields: [
      { key: "aestheticWords", label: ["Personality & visual direction", "الشخصية والتوجه البصري"], kind: "list" },
      { key: "colors", label: ["Brand colors", "ألوان العلامة"], kind: "colors" },
      { key: "fonts", label: ["Brand fonts", "خطوط العلامة"], kind: "list" }
    ]
  },
  {
    id: "voice",
    tab: "brand-voice",
    module: "brand",
    title: ["Voice & writing", "الأسلوب والكتابة"],
    fields: [
      { key: "toneWords", label: ["Tone (up to four words)", "النبرة (حتى أربع كلمات)"], kind: "list" },
      { key: "voiceNotes", label: ["Writing preferences", "تفضيلات الكتابة"], kind: "long", max: 1000 }
    ]
  },
  {
    id: "language",
    tab: "brand-voice",
    module: "company",
    title: ["Communication languages", "لغات التواصل"],
    fields: [{ key: "languages", label: ["Languages", "اللغات"], kind: "list" }]
  },
  {
    id: "basics",
    tab: "business",
    module: "company",
    title: ["Business details", "تفاصيل النشاط"],
    fields: [
      { key: "name", label: ["Business name", "اسم النشاط"], required: true, max: 160 },
      { key: "industry", label: ["Industry", "المجال"], max: 120 },
      { key: "size", label: ["Business size", "حجم النشاط"], max: 80 },
      { key: "location", label: ["Location", "الموقع"], max: 120 },
      { key: "establishment", label: ["Business establishment", "مرحلة النشاط"], kind: "stage" }
    ]
  },
  {
    id: "overview",
    tab: "business",
    module: "company",
    title: ["Business overview", "نبذة عن النشاط"],
    fields: [{ key: "description", label: ["Description", "الوصف"], kind: "long", max: 2000 }]
  },
  {
    id: "story",
    tab: "business",
    module: "story",
    title: ["Our story", "قصتنا"],
    fields: [
      { key: "origin", label: ["How we started", "كيف بدأنا"], kind: "long", max: 2000 },
      { key: "mission", label: ["Mission", "الرسالة"], kind: "long", max: 2000 },
      { key: "vision", label: ["Vision", "الرؤية"], kind: "long", max: 1000 }
    ]
  },
  {
    id: "difference",
    tab: "business",
    module: "story",
    title: ["What makes us different", "ما يميزنا"],
    fields: [
      { key: "usp", label: ["Our difference", "ما يميزنا"], kind: "long", max: 1000 },
      { key: "problemSolved", label: ["Problem we solve", "المشكلة التي نحلها"], kind: "long", max: 1000 },
      { key: "values", label: ["Values", "القيم"], kind: "list" }
    ]
  },
  {
    id: "contact",
    tab: "business",
    module: "company",
    title: ["Where to find us", "أين تجدنا"],
    fields: [
      { key: "website", label: ["Website", "الموقع الإلكتروني"], kind: "url" },
      { key: "socials", label: ["Social accounts", "حسابات التواصل"], kind: "list" },
      { key: "email", label: ["Business email", "بريد النشاط"], kind: "email" }
    ]
  }
];

export function profileFieldValue(field: ProfileField, value: unknown): unknown {
  if (field.kind === "colors") return Array.isArray(value) ? value : [];
  if (field.kind === "list") return Array.isArray(value) ? value.join("\n") : "";
  if (field.kind === "competitors") return Array.isArray(value) ? value : [];
  if (field.kind === "targets") return value && typeof value === "object" ? Object.entries(value).map(([name, target]) => ({ name, target })) : [];
  return typeof value === "string" ? value : field.kind === "stage" ? "UNSPECIFIED" : "";
}

export const isBrandColor = (value: string): boolean => value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);

export function profileChanges(fields: ProfileField[], values: Record<string, unknown>, locale: Locale = "en"): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.key];
      if (field.kind === "colors") {
        if (!Array.isArray(value) || value.some((color) => typeof color !== "string" || !isBrandColor(color)))
          throw new Error(locale === "ar" ? "أدخل رمز لون صالحاً من ست خانات، مثل #F36A13." : "Enter a valid six-digit hex color, such as #F36A13.");
        return [field.key, value];
      }
      if (field.kind === "list")
        return [
          field.key,
          String(value ?? "")
            .split("\n")
            .filter((line) => line.trim())
        ];
      if (field.kind === "competitors")
        return [
          field.key,
          (value as Array<Record<string, unknown>>).map((row) => Object.fromEntries(Object.entries(row).filter(([key, item]) => key === "name" || item !== "")))
        ];
      if (field.kind === "targets") {
        const rows = value as Array<{ name: string; target: string | number | boolean }>;
        if (rows.some((row) => !row.name.trim()) || new Set(rows.map((row) => row.name)).size !== rows.length)
          throw new Error("Each performance target needs a unique name.");
        return [field.key, Object.fromEntries(rows.map((row) => [row.name, row.target]))];
      }
      return [field.key, value === "" ? null : value];
    })
  );
}

export function parseOfferingMoney(value: string, currency: string): number | undefined {
  if (!value.trim()) return undefined;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!new RegExp(digits === 0 ? "^\\d+$" : `^\\d+(?:\\.\\d{1,${digits}})?$`).test(value))
    throw new Error(`Enter a price with up to ${digits} decimal places.`);
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("This price is too large.");
  return result;
}
