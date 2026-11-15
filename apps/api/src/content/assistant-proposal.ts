import type { AssistantResult } from "@markos/validation";

/** A short, server-authored preview of executable actions; never trusts provider claims. */
export function assistantProposal(
  result: AssistantResult,
  locale: string,
  media: Array<{ id: string; position: number; mediaAssetId: string | null }>,
  warnings: string[] = []
) {
  const ar = locale === "ar";
  const lines: string[] = [];
  if (result.conversion)
    lines.push(ar ? `تغيير صيغة المحتوى إلى ${result.conversion.contentType}.` : `Change format to ${result.conversion.contentType.toLowerCase()}.`);
  const caption = result.operations.find((op) => op.type === "updateContent" && op.field === "caption");
  if (caption?.type === "updateContent")
    lines.push(`${ar ? "النص" : "Caption"}: ${String(caption.value ?? "").slice(0, 180)}${String(caption.value ?? "").length > 180 ? "…" : ""}`);
  if (result.operations.some((op) => /Reel/.test(op.type))) lines.push(ar ? "تحديث سيناريو الريل." : "Update the Reel script.");
  if (result.operations.some((op) => op.type === "addMediaItem" || op.type === "removeMediaItem" || op.type === "reorderMediaItems"))
    lines.push(ar ? "تحديث ترتيب الشرائح ومحتواها." : "Update the slides and their order.");
  for (const target of result.generation.length > 3 ? [] : result.generation) {
    const item = media.find((m) => m.id === target.itemId);
    const label =
      media.length > 1 || target.itemId.startsWith("$")
        ? ar
          ? ` للشريحة ${item ? item.position + 1 : result.generation.indexOf(target) + 1}`
          : ` for slide ${item ? item.position + 1 : result.generation.indexOf(target) + 1}`
        : "";
    lines.push(
      item?.mediaAssetId
        ? ar
          ? `تعديل التصميم الحالي${label} مع الحفاظ على التفاصيل غير المطلوبة.`
          : `Edit the existing artwork${label}, preserving unrequested details.`
        : ar
          ? `إنشاء الوسائط${label}.`
          : `Generate media${label}.`
    );
  }
  if (result.generation.length > 3)
    lines.push(ar ? `إنشاء ${result.generation.length} شرائح وفق طلبك.` : `Generate ${result.generation.length} slides from your brief.`);
  const direction = result.operations.find((op) => op.type === "updateMediaItem" && op.field === "visualDirection");
  if (direction?.type === "updateMediaItem" && direction.value)
    lines.push(`${ar ? "التوجيه البصري" : "Visual direction"}: ${String(direction.value).slice(0, 180)}${String(direction.value).length > 180 ? "…" : ""}`);
  if (!lines.length && result.operations.length) lines.push(ar ? "تحديث تفاصيل المسودة وفق طلبك." : "Update the draft details you requested.");
  return [...lines, ...warnings];
}
