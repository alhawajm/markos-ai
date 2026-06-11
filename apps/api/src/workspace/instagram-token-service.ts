import type { InstagramConnection, InstagramTokenRefreshResult } from "@markos/shared-types";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

const defaultLongLivedExpiresInSeconds = 60 * 24 * 60 * 60;

interface RefreshTokenResponse {
  access_token?: string;
  expires_in?: number;
}

export class InstagramTokenRefreshError extends Error {
  constructor(message = "Instagram token refresh failed") {
    super(message);
  }
}

export async function refreshInstagramTokenForWorkspace(input: {
  workspaceId: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<InstagramTokenRefreshResult> {
  const now = input.now ?? new Date();
  const workspace = await prisma.workspace.findFirst({
    where: {
      deletedAt: null,
      id: input.workspaceId
    },
    select: {
      id: true,
      instagramAccessToken: true,
      instagramAccountId: true,
      instagramTokenExpiresAt: true
    }
  });

  if (!workspace?.instagramAccessToken || !workspace.instagramAccountId || !workspace.instagramTokenExpiresAt) {
    return {
      refreshed: false,
      reason: "INSTAGRAM_NOT_CONNECTED"
    };
  }

  if (workspace.instagramTokenExpiresAt <= now) {
    return {
      refreshed: false,
      reason: "INSTAGRAM_TOKEN_EXPIRED"
    };
  }

  const updated = await refreshWorkspaceToken(workspace, input.fetchImpl ?? fetch, now);

  return {
    connection: toConnection(updated),
    refreshed: true
  };
}

export async function refreshDueInstagramTokens(input: {
  fetchImpl?: typeof fetch;
  now?: Date;
} = {}): Promise<InstagramTokenRefreshResult[]> {
  const now = input.now ?? new Date();
  const refreshBefore = new Date(now.getTime() + env.INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const workspaces = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      instagramAccessToken: {
        not: null
      },
      instagramAccountId: {
        not: null
      },
      instagramTokenExpiresAt: {
        gt: now,
        lte: refreshBefore
      }
    },
    select: {
      id: true,
      instagramAccessToken: true,
      instagramAccountId: true,
      instagramTokenExpiresAt: true
    }
  });

  const results: InstagramTokenRefreshResult[] = [];

  for (const workspace of workspaces) {
    try {
      const updated = await refreshWorkspaceToken(workspace, input.fetchImpl ?? fetch, now);
      results.push({
        connection: toConnection(updated),
        refreshed: true,
        workspaceId: workspace.id
      });
    } catch (error) {
      results.push({
        refreshed: false,
        reason: error instanceof Error ? error.message : "INSTAGRAM_TOKEN_REFRESH_FAILED",
        workspaceId: workspace.id
      });
    }
  }

  return results;
}

async function refreshWorkspaceToken(
  workspace: {
    id: string;
    instagramAccessToken: string | null;
    instagramAccountId: string | null;
    instagramTokenExpiresAt: Date | null;
  },
  fetcher: typeof fetch,
  now: Date
) {
  if (!workspace.instagramAccessToken) {
    throw new InstagramTokenRefreshError("Instagram access token is missing");
  }

  const url = new URL(env.INSTAGRAM_REFRESH_TOKEN_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", workspace.instagramAccessToken);

  const response = await fetcher(url.toString());
  const payload = (await response.json().catch(() => ({}))) as RefreshTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new InstagramTokenRefreshError();
  }

  const expiresIn = payload.expires_in ?? defaultLongLivedExpiresInSeconds;

  return prisma.workspace.update({
    data: {
      instagramAccessToken: payload.access_token,
      instagramTokenExpiresAt: new Date(now.getTime() + expiresIn * 1000)
    },
    select: {
      instagramAccountId: true,
      instagramAccessToken: true,
      instagramTokenExpiresAt: true
    },
    where: {
      id: workspace.id
    }
  });
}

function toConnection(workspace: {
  instagramAccountId: string | null;
  instagramAccessToken: string | null;
  instagramTokenExpiresAt: Date | null;
}): InstagramConnection {
  const connected =
    workspace.instagramAccountId !== null &&
    workspace.instagramAccessToken !== null &&
    workspace.instagramTokenExpiresAt !== null &&
    workspace.instagramTokenExpiresAt > new Date();

  return {
    connected,
    ...(workspace.instagramAccountId === null ? {} : { accountId: workspace.instagramAccountId }),
    ...(workspace.instagramTokenExpiresAt === null ? {} : { tokenExpiresAt: workspace.instagramTokenExpiresAt.toISOString() })
  };
}
