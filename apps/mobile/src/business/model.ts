import type { ApprovedOnboardingDocumentProfile, BusinessKnowledgeRecord, OnboardingDocumentProfileDraft, BusinessProfile } from "@markos/shared-types";
import {
  companyOnboardingSchema,
  productsOnboardingSchema,
  storyOnboardingSchema,
  audienceOnboardingSchema,
  competitorsOnboardingSchema,
  brandOnboardingSchema,
  objectivesOnboardingSchema
} from "@markos/validation";

export const modules = ["company", "products", "story", "audience", "competitors", "brand", "objectives"] as const;
export type Module = (typeof modules)[number];
export type Values = Record<string, unknown>;
export type BusinessDraft = Record<Module, Values>;
type Label = [string, string];
export type FieldDefinition = { key: string; label: Label; kind?: "long" | "list" | "offerings" | "competitors"; max?: number };
export const labels: Record<Module, Label> = {
  company: ["Business details", "تفاصيل النشاط"],
  products: ["Products & services", "المنتجات والخدمات"],
  story: ["Your story", "قصتك"],
  audience: ["Your audience", "جمهورك"],
  competitors: ["Your market", "سوقك"],
  brand: ["Brand & voice", "العلامة والأسلوب"],
  objectives: ["Marketing strategy", "استراتيجية التسويق"]
};
const f = (key: string, en: string, ar: string, kind?: FieldDefinition["kind"], max?: number): FieldDefinition => ({ key, label: [en, ar], kind, max });
export const fields: Record<Module, FieldDefinition[]> = {
  company: [
    f("name", "Business name", "اسم النشاط", undefined, 160),
    f("description", "Business overview", "نبذة عن النشاط", "long", 2000),
    f("industry", "Industry", "المجال", undefined, 120),
    f("size", "Business size", "حجم النشاط", undefined, 80),
    f("location", "Location", "الموقع", undefined, 120),
    f("website", "Website", "الموقع الإلكتروني"),
    f("socials", "Social accounts", "الحسابات الاجتماعية", "list"),
    f("languages", "Communication languages", "لغات التواصل", "list")
  ],
  products: [
    f("summary", "What do you offer?", "ماذا تقدم؟", "long", 4000),
    f("items", "Products & services", "المنتجات والخدمات", "offerings"),
    f("differentiators", "What makes your offer different?", "ما الذي يميز عروضك؟", "list"),
    f("priceRange", "Price range", "نطاق الأسعار", undefined, 120),
    f("salesChannels", "Where do you sell?", "أين تبيع؟", "list")
  ],
  story: [
    f("origin", "How you started", "كيف بدأت", "long", 2000),
    f("mission", "Mission", "الرسالة", "long", 2000),
    f("problemSolved", "Problem you solve", "المشكلة التي تحلها", "long", 1000),
    f("usp", "What makes you different", "ما يميزك", "long", 1000),
    f("values", "Values", "القيم", "list"),
    f("vision", "Vision", "الرؤية", "long", 1000)
  ],
  audience: [
    f("demographics", "Describe your customers", "صف عملاءك", "long", 1000),
    f("ageRange", "Age range", "الفئة العمرية", undefined, 80),
    f("genderBreakdown", "Audience composition", "تكوين الجمهور", undefined, 120),
    f("locations", "Locations", "المناطق", "list"),
    f("interests", "Interests", "الاهتمامات", "list"),
    f("motivations", "Motivations", "الدوافع", "list"),
    f("painPoints", "Customer needs", "احتياجات العملاء", "list")
  ],
  competitors: [
    f("marketContext", "Market context", "سياق السوق", "long", 2000),
    f("items", "Competitors", "المنافسون", "competitors"),
    f("competitiveAdvantage", "Competitive advantage", "الميزة التنافسية", "long", 1000),
    f("doDifferently", "What to do differently", "ما نريد تقديمه بشكل مختلف", "long", 1000)
  ],
  brand: [
    f("aestheticWords", "Visual direction", "التوجه البصري", "list"),
    f("colors", "Brand colors (names or hex codes)", "ألوان العلامة (الأسماء أو الرموز)", "list"),
    f("fonts", "Brand fonts", "خطوط العلامة", "list"),
    f("toneWords", "Tone (up to four words)", "النبرة (حتى أربع كلمات)", "list"),
    f("voiceNotes", "Writing preferences", "تفضيلات الكتابة", "long", 1000)
  ],
  objectives: [
    f("currentPriority", "Current priority", "الأولوية الحالية", "long", 1000),
    f("contentDirection", "Content direction", "توجه المحتوى", "long", 2000),
    f("goals", "Marketing objectives", "الأهداف التسويقية", "list"),
    f("budgetRange", "Marketing budget", "ميزانية التسويق", undefined, 120),
    f("instagramExperience", "Instagram experience", "الخبرة في إنستغرام", undefined, 120),
    f("success90Days", "Success in 90 days", "النجاح خلال ٩٠ يومًا", "long", 1000)
  ]
};
export const schemas = {
  company: companyOnboardingSchema,
  products: productsOnboardingSchema,
  story: storyOnboardingSchema,
  audience: audienceOnboardingSchema,
  competitors: competitorsOnboardingSchema,
  brand: brandOnboardingSchema,
  objectives: objectivesOnboardingSchema
};
export const profileFields: { key: Exclude<keyof BusinessProfile, "businessName">; label: Label }[] = [
  { key: "tagline", label: ["Tagline", "الشعار النصي"] },
  { key: "overview", label: ["Overview", "نبذة"] },
  { key: "uniqueValue", label: ["Your difference", "ما يميزك"] },
  { key: "offerSummary", label: ["Your offer", "عروضك"] },
  { key: "idealCustomer", label: ["Ideal customer", "العميل المثالي"] },
  { key: "marketPosition", label: ["Market position", "التموضع في السوق"] },
  { key: "brandVoice", label: ["Brand voice", "أسلوب العلامة"] },
  { key: "marketingFocus", label: ["Marketing focus", "التركيز التسويقي"] }
];
export function fromKnowledge(value: BusinessKnowledgeRecord): BusinessDraft {
  const c = value.catalog;
  return {
    ...value.modules,
    products: c
      ? {
          expectedVersion: c.version,
          summary: c.summary ?? "",
          differentiators: c.differentiators,
          priceRange: c.priceRange ?? "",
          salesChannels: c.salesChannels,
          items: c.offerings.filter((item) => item.status !== "ARCHIVED")
        }
      : {}
  };
}
export function fromDocuments(value: OnboardingDocumentProfileDraft): BusinessDraft {
  const { offerings, ...rest } = value;
  return { ...rest, products: offerings };
}
export function meaningful(value: Values): boolean {
  return Object.entries(clean(value)).some(
    ([key, v]) => key !== "expectedVersion" && (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? !!v.trim() : false)
  );
}
export function clean(value: Values): Values {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && !(typeof v === "string" && !v.trim()))
      .map(([k, v]) => [
        k,
        typeof v === "string"
          ? v.trim()
          : Array.isArray(v)
            ? v.map((item) => (typeof item === "string" ? item.trim() : item && typeof item === "object" ? clean(item) : item)).filter((item) => item !== "")
            : v
      ])
  );
}
export function documentApproval(draft: BusinessDraft): ApprovedOnboardingDocumentProfile {
  return {
    company: schemas.company.parse(clean(draft.company)),
    offerings: schemas.products.parse(clean(draft.products)),
    ...Object.fromEntries(modules.filter((m) => m !== "company" && m !== "products" && meaningful(draft[m])).map((m) => [m, schemas[m].parse(clean(draft[m]))]))
  };
}
/** Patch only edited keys, so a focused save cannot erase unrendered facts. */
export function changesBetween(base: Values, draft: Values): Values {
  return Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(draft)])]
      .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(draft[key]))
      .map((key) => [key, typeof draft[key] === "string" ? draft[key].trim() || null : (draft[key] ?? null)])
  );
}
export function onboardingPayload(module: Module, draft: Values): Values {
  const value = clean(draft);
  const parsed = schemas[module].parse(value);
  const shape = schemas[module].shape as Record<string, { isOptional: () => boolean }>;
  const clearFields =
    module === "products"
      ? []
      : fields[module].filter((field) => !Object.hasOwn(parsed, field.key) && shape[field.key]?.isOptional()).map((field) => field.key);
  return { ...parsed, clearFields };
}
export function knowledgeVersion(value: BusinessKnowledgeRecord, module: Module): number {
  return module === "products" ? (value.catalog?.version ?? 0) : value.version;
}
export function records(value: unknown): Values[] {
  return Array.isArray(value) ? value.filter((x): x is Values => !!x && typeof x === "object" && !Array.isArray(x)) : [];
}
export function display(value: unknown): string {
  return Array.isArray(value) ? value.filter((x) => typeof x === "string").join("\n") : typeof value === "string" ? value : "";
}
export function listedPrice(value: Values): string | null {
  if (typeof value.priceMinor !== "number") return null;
  const currency = typeof value.currency === "string" ? value.currency : "BHD";
  try {
    const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
    return formatter.format(value.priceMinor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    return `${value.priceMinor} (${currency})`;
  }
}
export function moduleSummary(module: Module, value: Values): string {
  return fields[module]
    .flatMap((field) =>
      field.kind === "offerings" || field.kind === "competitors" ? records(value[field.key]).map((item) => display(item.name)) : [display(value[field.key])]
    )
    .filter((text) => text.trim())
    .slice(0, 3)
    .join("\n");
}
