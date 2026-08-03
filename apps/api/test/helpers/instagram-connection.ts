import { randomUUID } from "node:crypto";
import { persistInstagramConnection } from "../../src/workspace/instagram-connection-service";

export async function persistTestInstagramConnection(input: {
  workspaceId: string;
  actorId: string;
  accountId?: string;
  accessToken?: string;
  issuedAt?: Date;
  expiresAt?: Date;
}) {
  const issuedAt = input.issuedAt ?? new Date(Date.now() - 2 * 86_400_000);
  return persistInstagramConnection({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    accessToken: input.accessToken ?? `test-token-${randomUUID()}`,
    issuedAt,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 86_400_000),
    profile: {
      scopedUserId: `test-scoped-user-${randomUUID()}`,
      professionalAccountId: input.accountId ?? `test-account-${randomUUID()}`,
      username: `test-user-${randomUUID()}`,
      media: [],
    },
  });
}
