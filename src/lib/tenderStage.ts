// Pure stage-transition rules extracted from
// src/app/api/tenders/[id]/stage/route.ts so the authorization logic (who
// can advance/revert, the F14 award guard) is unit-testable without a DB.
// Keep this in sync with the route — it is the single source of truth for
// these decisions, imported by the route rather than duplicated inline.
import { ROLE_IDS } from "@/lib/roles";

export const FINAL_STAGE = 3;
export const INITIAL_STAGE = 0;
export const CANCELLED_STAGE = -1;

// Stage -> roles allowed to advance out of it (role_id).
// Stage 2 (Closed) and 3 (Awarded) intentionally have no entry: Closed ->
// Awarded is handled exclusively by the award endpoint
// (src/app/api/tenders/[id]/award/route.ts), not this one.
export const allowedAdvanceRoles: Record<number, number[]> = {
  0: [ROLE_IDS.ADMIN], // Upcoming -> Open
  1: [ROLE_IDS.ADMIN], // Open -> Closed
};

// Map stage -> status_code
// NOTE: tender_status.status_code casing is inconsistent in the live DB
// ('Upcoming'/'Open' are capitalized, 'closed'/'awarded' are lowercase — see
// docs/audit-history.md and AGENTS.md's casing-landmine note). Matching the
// casing the rest of the codebase already reads/writes (award route, dashboard
// stats) rather than "fixing" it here, since that's a data change out of scope.
export function getStatusCodeForStage(stage: number): string {
  if (stage === 0) return 'Upcoming';
  if (stage === 1) return 'Open';
  if (stage === 2) return 'closed';
  if (stage === 3) return 'awarded';
  return 'Open';
}

export function isFinalStage(stage: number): boolean {
  return stage >= FINAL_STAGE;
}

export function isCancelledStage(stage: number): boolean {
  return stage === CANCELLED_STAGE;
}

export function isInitialStage(stage: number): boolean {
  return stage <= INITIAL_STAGE;
}

// The sole authorization predicate for "advance": fails closed for any
// stage without an entry in allowedAdvanceRoles (2, 3, -1, or anything
// unmapped), so cancelled/final/award-gated stages never need a special
// case here — absence from the map is the guard.
export function hasAdvancePermission(currentStage: number, userRoleIds: number[]): boolean {
  return allowedAdvanceRoles[currentStage]?.some((r) => userRoleIds.includes(r)) ?? false;
}

export function hasRevertPermission(userRoleIds: number[]): boolean {
  return userRoleIds.includes(ROLE_IDS.ADMIN);
}

// F14: revert must not silently disagree with tender_award — refuse to
// revert out of Awarded(3) while an award record still references this
// tender.
export function awardBlocksRevert(currentStage: number, hasAwardRecord: boolean): boolean {
  return currentStage === FINAL_STAGE && hasAwardRecord;
}
