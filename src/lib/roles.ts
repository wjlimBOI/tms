// lib/roles.ts
// Canonical role IDs — verified against the `roles` table (2026-08-05).
// role_id 13 is "Legal Team", NOT Contractor — Contractor is 22.
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
} as const;
