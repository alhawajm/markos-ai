import { createHash } from "node:crypto";
import { withWorkspaceDbContext } from "../db/workspace-transaction";
import type { OAuthStateStore } from "./oauth-state";

export function createPrismaOAuthStateStore(userId: string, workspaceId: string): OAuthStateStore {
  return {
    async put(nonce, expiresAt) {
      await withWorkspaceDbContext(workspaceId, (tx) =>
        tx.oAuthStateNonce.create({
          data: { expiresAt, nonceHash: hashNonce(nonce), userId, workspaceId }
        })
      );
    },
    async consume(nonce) {
      const result = await withWorkspaceDbContext(workspaceId, (tx) =>
        tx.oAuthStateNonce.updateMany({
          data: { consumedAt: new Date() },
          where: {
            consumedAt: null,
            expiresAt: { gt: new Date() },
            nonceHash: hashNonce(nonce),
            userId,
            workspaceId
          }
        })
      );
      if (result.count === 1) return "consumed";
      const record = await withWorkspaceDbContext(workspaceId, (tx) =>
        tx.oAuthStateNonce.findUnique({
          where: { nonceHash: hashNonce(nonce) },
          select: { consumedAt: true, expiresAt: true }
        })
      );
      return record?.consumedAt ? "already_consumed" : "not_found_or_expired";
    }
  };
}

function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}
