import type { InstagramTokenRefreshResult } from "@markos/shared-types";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { InstagramBasicClient } from "./instagram-basic-client";
import { refreshSecureInstagram } from "./instagram-connection-service";

export class InstagramTokenRefreshError extends Error {
  constructor(message = "Instagram token refresh failed") {
    super(message);
  }
}

export async function refreshInstagramTokenForWorkspace(input: {
  actorId?: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<InstagramTokenRefreshResult> {
  return refreshSecureInstagram({
    workspaceId: input.workspaceId,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.fetchImpl ? { client: new InstagramBasicClient(input.fetchImpl) } : {}),
  });
}

export async function refreshDueInstagramTokens(input: {
  fetchImpl?: typeof fetch;
  now?: Date;
} = {}): Promise<InstagramTokenRefreshResult[]> {
  const now = input.now ?? new Date();
  const refreshBefore = new Date(
    now.getTime() + env.INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS * 86_400_000,
  );
  const oldestEligibleIssue = new Date(now.getTime() - 86_400_000);
  const connections = await prisma.instagramConnectionCredential.findMany({
    where: {
      deletedAt: null,
      status: "CONNECTED",
      tokenIssuedAt: { lte: oldestEligibleIssue },
      tokenExpiresAt: { gt: now, lte: refreshBefore },
    },
    select: { workspaceId: true },
  });

  return Promise.all(
    connections.map(async ({ workspaceId }) => ({
      ...(await refreshInstagramTokenForWorkspace({
        workspaceId,
        now,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      })),
      workspaceId,
    })),
  );
}
