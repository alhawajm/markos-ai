import { AsyncLocalStorage } from "node:async_hooks";

export interface WorkspaceContext {
  workspaceId: string;
}

const workspaceStorage = new AsyncLocalStorage<WorkspaceContext>();

export function setWorkspaceContext(context: WorkspaceContext): void {
  workspaceStorage.enterWith(context);
}

export function getWorkspaceContext(): WorkspaceContext | undefined {
  return workspaceStorage.getStore();
}

export function requireWorkspaceContext(): WorkspaceContext {
  const context = getWorkspaceContext();

  if (context === undefined) {
    throw new Error("Workspace context is required");
  }

  return context;
}
