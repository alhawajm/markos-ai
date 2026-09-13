import type { ContentType } from "./index";

export const contentMediaConstraints = {
  POST: { maximum: 1, minimumReady: 1, mimeTypes: ["image/jpeg"] },
  CAROUSEL: { maximum: 10, minimumReady: 2, mimeTypes: ["image/jpeg"] },
  REEL: { maximum: 1, minimumReady: 1, mimeTypes: ["video/mp4"] },
  STORY: { maximum: 1, minimumReady: 1, mimeTypes: ["image/jpeg", "video/mp4"] }
} as const satisfies Record<ContentType, { maximum: number; minimumReady: number; mimeTypes: readonly string[] }>;

export type ContentMediaIssue =
  | "CONTENT_MEDIA_SINGLE_ITEM_LIMIT"
  | "CONTENT_MEDIA_CAROUSEL_LIMIT"
  | "CONTENT_MEDIA_TYPE_INCOMPATIBLE"
  | "CONTENT_MEDIA_REQUIRED"
  | "CONTENT_MEDIA_CAROUSEL_MINIMUM"
  | "CONTENT_MEDIA_UNAVAILABLE";

/** Counts use stored IDs so unresolved or unavailable assets still occupy their slots. */
export function contentMediaIssue(
  contentType: ContentType,
  mediaIds: readonly string[],
  assets: readonly { id: string; mimeType: string }[],
  requireReady = false
): ContentMediaIssue | null {
  const constraint = contentMediaConstraints[contentType];
  if (mediaIds.length > constraint.maximum) {
    return contentType === "CAROUSEL" ? "CONTENT_MEDIA_CAROUSEL_LIMIT" : "CONTENT_MEDIA_SINGLE_ITEM_LIMIT";
  }
  if (requireReady && mediaIds.length < constraint.minimumReady) {
    return contentType === "CAROUSEL" ? "CONTENT_MEDIA_CAROUSEL_MINIMUM" : "CONTENT_MEDIA_REQUIRED";
  }
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const id of mediaIds) {
    const asset = byId.get(id);
    if (!asset) return "CONTENT_MEDIA_UNAVAILABLE";
    if (!(constraint.mimeTypes as readonly string[]).includes(asset.mimeType.toLowerCase())) return "CONTENT_MEDIA_TYPE_INCOMPATIBLE";
  }
  return null;
}
