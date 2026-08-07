// lib/permissions.ts
import pool from "./db";
import { ROLE_IDS } from "./roles";

// Helper to ensure roleIds is an array (for when a single number is passed)
function normalizeRoleIds(roleIds: number | number[] | undefined): number[] {
  if (!roleIds) return [];
  return Array.isArray(roleIds) ? roleIds : [roleIds];
}

// Helper to check if user has a specific role (handles both array and single number)
export function hasRole(roleIds: number | number[] | undefined, targetRoleId: number): boolean {
  const arr = normalizeRoleIds(roleIds);
  return arr.includes(targetRoleId);
}

// ========== EXISTING PERMISSIONS ==========

export async function canEditSubmission(
  submissionId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);

  if (hasRole(roles, ROLE_IDS.ADMIN)) {
    return true;
  }
  if (!hasRole(roles, ROLE_IDS.CONTRACTOR)) {
    return false;
  }

  const result = await pool.query(
    `SELECT status, round_no, contractor_id,
            (SELECT MAX(round_no) FROM tender_submission
             WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id
               AND is_deleted = false) as max_round
     FROM tender_submission ts
     WHERE submission_id = $1 AND is_deleted = false`,
    [submissionId]
  );
  if (result.rows.length === 0) {
    return false;
  }
  const sub = result.rows[0];
  const ownsSubmission = sub.contractor_id === userId;
  const isDraft = sub.status === 'Draft';
  const isLatest = sub.round_no === sub.max_round;

  return ownsSubmission && isDraft && isLatest;
}

export async function canEditLineItem(
  lineItemId: number,
  userId: number,
  roleIds: number | number[],
  submissionId?: number
): Promise<boolean> {
  let actualSubmissionId = submissionId;
  if (!actualSubmissionId) {
    const res = await pool.query(
      `SELECT submission_id FROM bq_line_item WHERE line_item_id = $1`,
      [lineItemId]
    );
    if (res.rows.length === 0) return false;
    actualSubmissionId = res.rows[0].submission_id;
  }
  if (!actualSubmissionId) return false;
  return canEditSubmission(actualSubmissionId, userId, roleIds);
}

// ========== TENDER PERMISSIONS ==========

export async function canViewTender(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (hasRole(roles, ROLE_IDS.ADMIN)) return true;

  const result = await pool.query(
    `SELECT created_by, branch_id FROM tender WHERE tender_id = $1 AND is_deleted = false`,
    [tenderId]
  );
  if (result.rows.length === 0) return false;
  const tender = result.rows[0];

  // If user is contractor and created the tender
  if (hasRole(roles, ROLE_IDS.CONTRACTOR) && tender.created_by === userId) return true;
  return false;
}

export async function canEditTender(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (hasRole(roles, ROLE_IDS.ADMIN)) return true;
  if (hasRole(roles, ROLE_IDS.CONTRACTOR)) {
    const result = await pool.query(
      `SELECT created_by FROM tender WHERE tender_id = $1 AND is_deleted = false`,
      [tenderId]
    );
    if (result.rows.length && result.rows[0].created_by === userId) return true;
  }
  return false;
}

export async function canDeleteTender(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  return hasRole(roleIds, ROLE_IDS.ADMIN);
}

// ========== CONTRACTOR CLOSED TENDER PARTICIPATION CHECK ==========
export async function canViewTenderWithParticipation(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  // Admin and any non-contractor roles can view any tender
  if (!hasRole(roles, ROLE_IDS.CONTRACTOR)) return true; // only contractors need further checks

  // Contractor: first check if tender is open
  const tenderRes = await pool.query(
    `SELECT ts.status_code FROM tender t
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) return false;
  const statusCode = tenderRes.rows[0].status_code;

  if (statusCode !== 'closed') return true;

  // Tender is closed – check if contractor has any submission for this tender
  const submissionRes = await pool.query(
    `SELECT 1 FROM tender_submission
     WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
     LIMIT 1`,
    [tenderId, userId]
  );
  return submissionRes.rows.length > 0;
}

// ========== DRAFT TENDER VISIBILITY ==========
export async function canViewDraftTender(roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  const allowedRoles: number[] = [ROLE_IDS.ADMIN]; // Admin only by default – add more role IDs here
  return allowedRoles.some(allowed => roles.includes(allowed));
}