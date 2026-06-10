import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@markos/shared-types";

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  roles: Role[];
}

const workspaceStorage = new AsyncLocalStorage<Partial<WorkspaceContext>>();

export function runWorkspaceContextScope<T>(callback: () => T): T {
  return workspaceStorage.run({}, callback);
}

export function setWorkspaceContext(context: WorkspaceContext): void {
  const store = workspaceStorage.getStore();

  if (store === undefined) {
    workspaceStorage.enterWith({ ...context });
    return;
  }

  Object.assign(store, context);
}

export function getWorkspaceContext(): WorkspaceContext | undefined {
  const store = workspaceStorage.getStore();

  if (store?.workspaceId === undefined || store.userId === undefined || store.roles === undefined) {
    return undefined;
  }

  return store as WorkspaceContext;
}

export function requireWorkspaceContext(): WorkspaceContext {
  const context = getWorkspaceContext();

  if (context === undefined) {
    throw new Error("Workspace context is required");
  }

  return context;
}
