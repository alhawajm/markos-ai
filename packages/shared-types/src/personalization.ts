export type PersonalMemoryKey = "LANGUAGE" | "TONE" | "VISUAL_STYLE" | "CONTENT_FORMAT" | "WORKFLOW" | "AVOID";
export interface PersonalMemory {
  id: string;
  key: PersonalMemoryKey;
  text: string;
  updatedAt: string;
}
