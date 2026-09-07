// Shared editor/API policy. Keep the AI contract's limits in sync.
export const CONTENT_CAPTION_MAX_LENGTH = 2200;
export const CONTENT_CAPTION_MAX_HASHTAGS = 30;

export function captionCharacterCount(caption: string): number {
  return Array.from(caption).length;
}

export function captionHashtagCount(caption: string): number {
  return (caption.match(/#[^\s#]+/gu) ?? []).length;
}

export function captionValidationIssue(caption: string): "length" | "hashtags" | null {
  if (captionCharacterCount(caption) > CONTENT_CAPTION_MAX_LENGTH) return "length";
  if (captionHashtagCount(caption) > CONTENT_CAPTION_MAX_HASHTAGS) return "hashtags";
  return null;
}
