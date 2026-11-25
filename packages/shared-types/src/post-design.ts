export const postRatios = ["1:1", "4:5", "3:4"] as const;
export const postStyles = ["editorial", "soft", "hybrid"] as const;
export const postFonts = ["regular", "bold", "compact"] as const;
export type PostRatio = (typeof postRatios)[number];
export type PostStyle = (typeof postStyles)[number];
export type PostFont = (typeof postFonts)[number];

export interface PostArtwork {
  ratio: PostRatio;
  style: PostStyle;
  font: PostFont;
  title: string;
  detail: string;
  zoom: number;
  strokes: { x: number; y: number }[][];
}

export type PostArtworkSource = { photoBase64: string } | { mediaAssetId: string };

// Original MARKOS recipe copy. These are layout references, with no bundled stock imagery.
export const postTemplates = [
  {
    id: "special",
    en: "Daily special",
    ar: "عرض اليوم",
    recipe: "One hero photo, an offer headline, one detail line, and a simple call to action.",
    style: "hybrid",
    terms: /food|menu|cafe|bakery|sale|offer|عرض|قهوة|مطعم|مخبز/i
  },
  {
    id: "opening",
    en: "Opening hours",
    ar: "ساعات العمل",
    recipe: "Full-bleed photo, a clear hours headline, then exact days and times. Never guess missing hours.",
    style: "editorial",
    terms: /hour|opening|schedule|timing|أوقات|ساعات|دوام/i
  },
  {
    id: "event",
    en: "Event announcement",
    ar: "إعلان فعالية",
    recipe: "Lead with the event name, followed by confirmed date and location, then the next action.",
    style: "editorial",
    terms: /event|launch|workshop|webinar|افتتاح|فعالية|ورشة/i
  },
  {
    id: "product",
    en: "Product spotlight",
    ar: "تسليط الضوء على منتج",
    recipe: "Let one product photo lead. Add the name, one factual benefit, and an optional short call to action.",
    style: "soft",
    terms: /product|shop|handmade|collection|منتج|متجر|مجموعة/i
  },
  {
    id: "tip",
    en: "Quick tip",
    ar: "نصيحة سريعة",
    recipe: "Use a short headline for the tip and one concise explanation. Leave generous space around the text.",
    style: "soft",
    terms: /tip|tutorial|lesson|how to|نصيحة|خطوات|طريقة/i
  }
] as const;

export function recommendPostTemplates(context: string, limit = 3) {
  return postTemplates
    .map((template, index) => ({ template, index, match: template.terms.test(context) }))
    .sort((a, b) => Number(b.match) - Number(a.match) || a.index - b.index)
    .slice(0, limit)
    .map(({ template }) => template);
}

export const postRatiosByValue: Record<PostRatio, number> = { "1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4 };
export const canPublishPostRatio = (ratio: PostRatio | undefined) => ratio !== "3:4";

export function wantsPostIdeas(text: string) {
  return /\b(?:ideas?|brainstorm|inspiration|templates?)\b|أفكار|افكار|قوالب|إلهام|الهام/i.test(text);
}

export function requestsPostDesign(text: string) {
  if (/\b(?:curate|campaign|strateg(?:y|ies)|carousels?|stories|reels?|videos?)\b|حمل[ةه]|استراتيجي|ريلز?|فيديو|ستوري/i.test(text)) return false;
  return /\b(?:design|make|create|draft|brainstorm)\b.{0,80}\bposts?\b|\bpost\s+(?:ideas?|templates?)\b|(?:صمم|تصميم|أنشئ|انشئ|إنشاء|انشاء|أفكار|افكار).{0,55}منشور/i.test(
    text
  );
}

export function postOverlayCopy(caption: string) {
  const lines = caption
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    title: Array.from(lines[0] ?? "")
      .slice(0, 100)
      .join(""),
    detail: Array.from(lines.slice(1).find((line) => !/^#/.test(line)) ?? "")
      .slice(0, 190)
      .join("")
  };
}
