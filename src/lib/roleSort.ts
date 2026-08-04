// lib/roleSort.ts

export interface Role {
  role_id: number;
  role_name: string;
  display_name?: string;   // stored in DB, fallback to role_name
  sort_order?: number;     // stored in DB, fallback to 999
}

/**
 * Get the display name for a role – uses DB field if available, else falls back to role_name.
 */
export function getRoleDisplayName(role: Role): string {
  return role.display_name || role.role_name;
}

/**
 * Get the priority (sort order) for sorting.
 * Falls back to 999 if not set.
 */
export function getRolePriority(role: Role): number {
  return role.sort_order ?? 999;
}

/**
 * Sort roles by sort_order (if present), then by display_name (fallback to role_name).
 */
export function sortRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => {
    const orderA = a.sort_order ?? 999;
    const orderB = b.sort_order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.display_name || a.role_name;
    const nameB = b.display_name || b.role_name;
    return nameA.localeCompare(nameB);
  });
}