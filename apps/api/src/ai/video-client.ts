import { z } from "zod";
import { requestAi, requestAiBinary } from "./request";

const videoJobResponseSchema = z.object({
  provider_job_id: z.string().min(1).max(240),
  status: z.enum(["queued", "in_progress", "completed", "failed"]),
  progress: z.number().int().min(0).max(100),
  model: z.string().min(1).max(200),
  duration_seconds: z.number().int().positive().max(60),
  width: z.number().int().positive().max(2_560),
  height: z.number().int().positive().max(2_560),
  error_code: z.string().max(160).nullable().optional(),
  error_message: z.string().max(500).nullable().optional(),
  retryable: z.boolean().nullable().optional()
});

export type VideoProviderJob = z.infer<typeof videoJobResponseSchema>;

export function startVideoGeneration(input: { durationSeconds: 4 | 8 | 12; prompt: string; workspaceId: string }): Promise<VideoProviderJob> {
  return requestAi("/ai/videos/start", {
    body: {
      duration_seconds: input.durationSeconds,
      prompt: input.prompt,
      workspace_id: input.workspaceId
    },
    parse: (value) => videoJobResponseSchema.parse(value)
  });
}

export function getVideoGenerationStatus(providerJobId: string): Promise<VideoProviderJob> {
  return requestAi("/ai/videos/status", {
    body: { provider_job_id: providerJobId },
    parse: (value) => videoJobResponseSchema.parse(value)
  });
}

export function downloadGeneratedVideo(providerJobId: string): Promise<Buffer> {
  return requestAiBinary("/ai/videos/download", { provider_job_id: providerJobId });
}
