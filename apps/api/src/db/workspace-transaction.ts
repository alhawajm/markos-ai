import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type WorkspaceTransactionClient = Prisma.TransactionClient;

export async function withWorkspaceDbContext<T>(workspaceId: string, callback: (tx: WorkspaceTransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setWorkspaceDbContext(tx, workspaceId);
    return callback(tx);
  });
}

export async function setWorkspaceDbContext(tx: WorkspaceTransactionClient, workspaceId: string): Promise<void> {
  await tx.$executeRawUnsafe("SET LOCAL ROLE markos_app");
  await tx.$executeRaw`SELECT set_config('app.current_workspace', ${workspaceId}, true)`;
}
