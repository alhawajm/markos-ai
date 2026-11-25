import { z } from "zod";
import { postFonts, postRatios, postStyles } from "@markos/shared-types";
import { workspaceAssistantMessageSchema } from "./workspace-assistant";

export const beginPostDesignSchema = workspaceAssistantMessageSchema.omit({ intent: true }).extend({ chatId: z.string().uuid() }).strict();
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export const renderPostArtworkSchema = z
  .object({
    ratio: z.enum(postRatios),
    style: z.enum(postStyles),
    font: z.enum(postFonts),
    title: z.string().trim().max(100),
    detail: z.string().trim().max(190),
    zoom: z.number().min(1).max(2),
    strokes: z.array(z.array(point).min(2).max(250)).max(16),
    source: z.union([z.object({ photoBase64: z.string().min(4).max(10_666_668) }).strict(), z.object({ mediaAssetId: z.string().uuid() }).strict()]).optional()
  })
  .strict();
