import { requestAi } from "./request";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { recordAiTokenUsage } from "../usage/usage-service";

const responseSchema = z.object({
  model: z.string().min(1).max(200),
  space: z.string().min(1).max(300),
  dimensions: z.literal(1536),
  tokens_in: z.number().int().nonnegative(),
  embeddings: z.array(
    z
      .array(z.number().finite())
      .length(1536)
      .refine((values) => values.some((value) => value !== 0))
  )
});
type EmbeddingResponse = z.infer<typeof responseSchema>;

export async function embedVaultTexts(texts: string[], workspaceId: string): Promise<EmbeddingResponse> {
  const body = responseSchema.parse(await requestAi<unknown>("/ai/vault/embed", { body: { texts } }));

  if (body.embeddings.length !== texts.length) {
    throw new Error("AI embedding response does not match the Vault embedding contract");
  }

  if (body.tokens_in > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: "VAULT_EMBEDDING",
          promptVersion: "vault-embedding.v2",
          prompt: { documentCount: texts.length },
          response: { space: body.space, dimensions: body.dimensions },
          model: body.model,
          tokensIn: body.tokens_in,
          tokensOut: 0,
          costMinor: 0,
          currency: "BHD"
        }
      });
      await recordAiTokenUsage({ client: tx, workspaceId, tokensIn: body.tokens_in, tokensOut: 0 });
    });
  }

  return body;
}
