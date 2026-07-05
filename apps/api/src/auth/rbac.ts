import type { Permission, Role } from "@markos/shared-types";

const readPermissions = [
  "workspace:read",
  "vault:read",
  "billing:read",
  "onboarding:read",
  "strategy:read",
  "content:read",
  "media:read",
  "analytics:read",
  "prompt:read"
] as const satisfies Permission[];

const editPermissions = [
  ...readPermissions,
  "vault:write",
  "onboarding:write",
  "strategy:generate",
  "content:write",
  "content:schedule",
  "agent:run",
  "billing:manage",
  "media:write",
  "analytics:sync",
  "publishing:run",
  "prompt:manage"
] as const satisfies Permission[];

const adminPermissions = [
  ...editPermissions,
  "workspace:audit:read",
  "workspace:data:export",
  "workspace:data:erase",
  "instagram:manage"
] as const satisfies Permission[];

const platformReadPermissions = [
  ...readPermissions,
  "workspace:audit:read",
  "admin:read"
] as const satisfies Permission[];

const platformManagePermissions = [
  ...adminPermissions,
  "admin:read",
  "admin:manage"
] as const satisfies Permission[];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  OWNER: adminPermissions,
  WORKSPACE_ADMIN: adminPermissions,
  EDITOR: editPermissions,
  VIEWER: readPermissions,
  SUPER_ADMIN: platformManagePermissions,
  PRODUCT_ADMIN: platformManagePermissions,
  SUPPORT_ADMIN: platformReadPermissions,
  FINANCE_ADMIN: [...platformReadPermissions, "billing:manage"],
  READONLY_ADMIN: platformReadPermissions
};

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => rolePermissions[role].includes(permission));
}

export function hasPermissions(roles: readonly Role[], permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(roles, permission));
}
