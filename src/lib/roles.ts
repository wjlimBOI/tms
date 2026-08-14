// lib/roles.ts
// Canonical role IDs — verified against the `roles` table (2026-08-05).
// role_id 13 is "Legal Team", NOT Contractor — Contractor is 22.
// role_id 23 "Developer" added 2026-08-09 — sole app developer, full bypass
// everywhere Admin gets one (see docs/rbac.md "Developer/ED bypass rollout").
// See docs/rbac.md before adding new role-based checks.
export const ROLE_IDS = {
  ADMIN: 1,
  EXECUTIVE_DIRECTOR: 2,
  CEO: 3,
  SCOO: 4,
  COO: 5,
  FM_REGIONAL_DIRECTOR: 6,
  FM_DEPUTY_GENERAL_MANAGER: 7,
  PROJECT_MANAGER: 8,
  FINANCE_MANAGER: 9,
  FINANCE_GENERAL_MANAGER: 10,
  FINANCE_TEAM: 11,
  INTERNAL_AUDIT_TEAM: 12,
  LEGAL_TEAM: 13,
  RENOVATION_TEAM: 14,
  SENIOR_PROJECT_MANAGER: 15,
  CONTRACTOR: 22,
  DEVELOPER: 23,
} as const;

// Roles that bypass every authorization gate the same way Admin does.
// Use this instead of a bare `hasRole(roles, ROLE_IDS.ADMIN)` in new checks.
export function isSuperUser(roleIds: number | number[] | undefined): boolean {
  const arr = Array.isArray(roleIds) ? roleIds : roleIds != null ? [roleIds] : [];
  return arr.includes(ROLE_IDS.ADMIN) || arr.includes(ROLE_IDS.DEVELOPER);
}

// Roles that bypass every *view*-only authorization gate (Executive Director
// gets full visibility for oversight, but not the create/edit/delete/manage
// bypass isSuperUser grants) — use only in "canView*"-style checks, never in
// a check that also gates a mutation.
export function isSuperViewer(roleIds: number | number[] | undefined): boolean {
  const arr = Array.isArray(roleIds) ? roleIds : roleIds != null ? [roleIds] : [];
  return isSuperUser(arr) || arr.includes(ROLE_IDS.EXECUTIVE_DIRECTOR);
}
