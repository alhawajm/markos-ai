import { z } from "zod";

export const updateBusinessKnowledgeSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    module: z.enum(["company", "story", "audience", "competitors", "brand", "objectives"]),
    changes: z.record(z.string(), z.unknown())
  })
  .strict();

export const offeringMaintenanceSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    id: z.string().uuid().optional(),
    offering: z
      .object({
        kind: z.enum(["PRODUCT", "SERVICE", "UNSPECIFIED"]),
        name: z
          .string()
          .min(1)
          .max(160)
          .refine((value) => Boolean(value.trim())),
        nameEn: z.string().max(160).optional(),
        nameAr: z.string().max(160).optional(),
        category: z.string().max(120).optional(),
        description: z.string().max(1000).optional(),
        priceType: z.enum(["UNSPECIFIED", "FIXED", "FROM", "RANGE", "QUOTE"]),
        priceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        minPriceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        maxPriceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .refine((value) => Intl.supportedValuesOf("currency").includes(value), "Choose a supported currency"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"])
      })
      .strict()
      .superRefine((value, context) => {
        const invalid = (message: string, field: string) => context.addIssue({ code: "custom", message, path: [field] });
        if (["FIXED", "FROM"].includes(value.priceType) && value.priceMinor === undefined) invalid("Enter a price", "priceMinor");
        if (
          value.priceType === "RANGE" &&
          (value.minPriceMinor === undefined || value.maxPriceMinor === undefined || value.maxPriceMinor < value.minPriceMinor)
        )
          invalid("Enter a valid price range", "maxPriceMinor");
        if (!["FIXED", "FROM"].includes(value.priceType) && value.priceMinor !== undefined) invalid("This price type does not use a fixed price", "priceMinor");
        if (value.priceType !== "RANGE" && (value.minPriceMinor !== undefined || value.maxPriceMinor !== undefined))
          invalid("This price type does not use a range", "minPriceMinor");
      })
  })
  .strict();

export type OfferingMaintenanceInput = z.infer<typeof offeringMaintenanceSchema>;
