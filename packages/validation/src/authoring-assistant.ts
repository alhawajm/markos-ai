import { z } from "zod";

// Local references exist only within this result; they are never persisted IDs.
const reference = z.union([z.string().uuid(), z.string().regex(/^\$[a-zA-Z][a-zA-Z0-9_]{0,39}$/)]);
const localReference = z.string().regex(/^\$[a-zA-Z][a-zA-Z0-9_]{0,39}$/);
const ordered = z
  .array(reference)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs");
export const assistantResultSchema = z
  .object({
    reply: z.string().min(1).max(6000),
    summary: z.string().max(4000),
    conversion: z
      .object({ contentType: z.enum(["POST", "CAROUSEL", "REEL", "STORY"]), retainMediaItemId: z.string().uuid().nullable() })
      .strict()
      .nullable(),
    operations: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              type: z.literal("updateContent"),
              field: z.enum(["caption", "contentPillar", "campaignGoal", "tone", "brief"]),
              value: z.string().max(2200).nullable()
            })
            .strict(),
          z
            .object({
              type: z.literal("updateMediaItem"),
              itemId: reference,
              field: z.enum(["mediaKind", "purpose", "title", "body", "visualDirection", "aspectRatio", "generationDurationSeconds"]),
              value: z.union([z.string().max(2000), z.number().int(), z.null()])
            })
            .strict(),
          z
            .object({
              type: z.literal("addMediaItem"),
              ref: localReference,
              purpose: z.string().max(160).nullable(),
              title: z.string().max(160).nullable(),
              body: z.string().max(800).nullable(),
              visualDirection: z.string().max(2000).nullable()
            })
            .strict(),
          z.object({ type: z.literal("removeMediaItem"), itemId: reference }).strict(),
          z.object({ type: z.literal("reorderMediaItems"), orderedIds: ordered }).strict(),
          z
            .object({
              type: z.literal("updateReelScript"),
              field: z.enum(["hook", "intendedDurationSeconds"]),
              value: z.union([z.string().max(300), z.number().int(), z.null()])
            })
            .strict(),
          z.object({ type: z.literal("addReelBeat"), ref: localReference, text: z.string().min(1).max(800) }).strict(),
          z.object({ type: z.literal("updateReelBeat"), beatId: reference, text: z.string().max(800) }).strict(),
          z.object({ type: z.literal("removeReelBeat"), beatId: reference }).strict(),
          z.object({ type: z.literal("reorderReelBeats"), orderedIds: ordered }).strict()
        ])
      )
      .max(50),
    generation: z.array(z.object({ itemId: reference }).strict()).max(10)
  })
  .strict();
export type AssistantResult = z.infer<typeof assistantResultSchema>;
export const assistantConfirmationSchema = z.object({ confirmationToken: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict();
