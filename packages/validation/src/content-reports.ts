import { z } from "zod";
import { contentReportReasons, contentReportSources } from "@markos/shared-types";

export const contentReportSchema = z
  .object({
    requestId: z.string().uuid(),
    source: z.enum(contentReportSources),
    sourceId: z.string().uuid().nullish(),
    reason: z.enum(contentReportReasons),
    note: z.string().trim().max(1500).default("")
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "GENERAL_AI") {
      if (value.sourceId) ctx.addIssue({ code: "custom", path: ["sourceId"], message: "General reports do not reference another resource" });
      if (value.note.length < 10) ctx.addIssue({ code: "custom", path: ["note"], message: "Describe the content you are reporting" });
    } else if (!value.sourceId) ctx.addIssue({ code: "custom", path: ["sourceId"], message: "Choose the reported content" });
  });
export const contentReportReviewSchema = z
  .object({
    status: z.enum(["RESOLVED", "DISMISSED"]),
    note: z.string().trim().min(3).max(1500)
  })
  .strict();
