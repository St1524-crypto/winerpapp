import type { AppRole } from "@/hooks/use-auth";

export const ADMIN_PORTAL_ROLES = ["super_admin", "admin"] as const;
export const VENDOR_PORTAL_ROLES = ["vendor"] as const;
export const OPERATIONS_ROLES = ["finance", "warehouse", "sales"] as const;

export function hasAnyRole(roles: readonly string[], allowed: readonly string[]) {
  return roles.some((role) => allowed.includes(role));
}

export function isAdminPortalRole(roles: readonly string[]) {
  return hasAnyRole(roles, ADMIN_PORTAL_ROLES);
}

export function isVendorPortalRole(roles: readonly string[]) {
  return hasAnyRole(roles, VENDOR_PORTAL_ROLES);
}

export function getPortalRouteForRoles(roles: readonly AppRole[]) {
  if (isAdminPortalRole(roles)) return "/admin" as const;
  if (isVendorPortalRole(roles)) return "/vendor" as const;
  if (hasAnyRole(roles, OPERATIONS_ROLES)) return "/dashboard" as const;
  return "/shop/account" as const;
}
