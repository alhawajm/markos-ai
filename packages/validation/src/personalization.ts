import { z } from "zod";

export const memoryKeySchema = z.enum(["LANGUAGE", "TONE", "VISUAL_STYLE", "CONTENT_FORMAT", "WORKFLOW", "AVOID"]);
export const memoryUpdateSchema = z
  .object({
    key: memoryKeySchema,
    operation: z.enum(["REMEMBER", "FORGET"]),
    text: z.string().trim().max(500),
    evidence: z.string().trim().min(1).max(1000)
  })
  .strict();
export const memoryUpdatesSchema = z.array(memoryUpdateSchema).max(6).optional();
export type MemoryUpdate = z.infer<typeof memoryUpdateSchema>;
