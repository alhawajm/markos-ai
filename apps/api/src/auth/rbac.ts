import type { Permission, Role } from "@markos/shared-types";

const readPermissions = [
  "workspace:read",
  "vault:read",
  "onboarding:read",
  "strategy:read",
  "content:read",
  "media:read"
] as const satisfies Permission[];

const editPermissions = [
  ...readPermissions,
  "vault:write",
  "onboarding:write",
  "strategy:generate",
  "content:write",
  "content:schedule",
  "media:write",
  "publishing:run"
] as const satisfies Permission[];

const adminPermissions = [
  ...editPermissions,
  "workspace:audit:read",
  "instagram:manage"
] as const satisfies Permission[];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  OWNER: adminPermissions,
  WORKSPACE_ADMIN: adminPermissions,
  EDITOR: editPermissions,
  VIEWER: readPermissions,
  SUPER_ADMIN: adminPermissions,
  PRODUCT_ADMIN: adminPermissions,
  SUPPORT_ADMIN: [...readPermissions, "workspace:audit:read"],
  FINANCE_ADMIN: [...readPermissions, "workspace:audit:read"],
  READONLY_ADMIN: [...readPermissions, "workspace:audit:read"]
};

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => rolePermissions[role].includes(permission));
}

export function hasPermissions(roles: readonly Role[], permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(roles, permission));
}
