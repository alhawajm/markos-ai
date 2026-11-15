import { z } from "zod";
export const workspaceAssistantMessageSchema = z
  .object({ requestId: z.string().uuid(), message: z.string().trim().min(1).max(4000), locale: z.enum(["en", "ar"]) })
  .strict();
export const workspaceAssistantConfirmSchema = z.object({ confirmationToken: z.string().uuid() }).strict();
export const workspaceAssistantResultSchema = z
  .object({
    reply: z.string().min(1).max(4000),
    proposal: z
      .object({
        action: z.enum(["CONTENT", "EDIT_CONTENT", "CAMPAIGN", "STRATEGY"]),
        summary: z.string().min(1).max(1000),
        instruction: z.string().min(1).max(3500),
        contentType: z.enum(["POST", "CAROUSEL", "REEL", "STORY"]).nullable(),
        contentItemId: z.string().uuid().nullable(),
        durationDays: z.union([z.literal(3), z.literal(7), z.literal(14)]).nullable(),
        startsAt: z.string().datetime().nullable(),
        publishesPerDay: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable()
      })
      .strict()
      .nullable()
  })
  .strict();
