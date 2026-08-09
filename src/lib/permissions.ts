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

// ========== HANDOVER / DLP PERMISSIONS ==========
// Admin, or the Project Manager (or Senior PM) actually assigned to this
// tender. `project_managers` (the dropdown reference table) has no link to a
// real login account, so "the assigned PM" is resolved via email match
// against `tender.project_manager_email` — a denormalized column snapshotted
// onto the tender at creation time, not a join to `project_managers`.
export async function canMarkHandover(
  tenderId: number,
  userEmail: string | null | undefined,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (hasRole(roles, ROLE_IDS.ADMIN)) return true;
  if (!hasRole(roles, ROLE_IDS.PROJECT_MANAGER) && !hasRole(roles, ROLE_IDS.SENIOR_PROJECT_MANAGER)) {
    return false;
  }
  if (!userEmail) return false;

  const result = await pool.query(
    `SELECT project_manager_email FROM tender WHERE tender_id = $1 AND is_deleted = false`,
    [tenderId]
  );
  if (result.rows.length === 0 || !result.rows[0].project_manager_email) return false;
  return result.rows[0].project_manager_email.toLowerCase() === userEmail.toLowerCase();
}

// ========== TENDER MESSAGING (contractor Q&A + staff announcements) ==========
// Private thread per (tender, contractor) pair — a contractor only ever
// unlocks their own thread (contractorId must equal userId), staff can
// access any contractor's thread on a tender they have responsibility for.
// This deliberately mirrors the app's existing contractor-anonymity stance
// (BQ comparison masking) rather than a single shared per-tender thread.
export async function canAccessTenderMessages(
  tenderId: number,
  userId: number,
  userEmail: string | null | undefined,
  roleIds: number | number[],
  contractorId?: number
): Promise<{ allowed: boolean; isStaff: boolean }> {
  const roles = normalizeRoleIds(roleIds);

  if (hasRole(roles, ROLE_IDS.ADMIN)) return { allowed: true, isStaff: true };

  const tenderRes = await pool.query(
    `SELECT created_by, project_manager_email FROM tender WHERE tender_id = $1 AND is_deleted = false`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) return { allowed: false, isStaff: false };
  const tender = tenderRes.rows[0];

  if (tender.created_by === userId) return { allowed: true, isStaff: true };
  if (
    (hasRole(roles, ROLE_IDS.PROJECT_MANAGER) || hasRole(roles, ROLE_IDS.SENIOR_PROJECT_MANAGER)) &&
    userEmail && tender.project_manager_email &&
    tender.project_manager_email.toLowerCase() === userEmail.toLowerCase()
  ) {
    return { allowed: true, isStaff: true };
  }

  if (hasRole(roles, ROLE_IDS.CONTRACTOR)) {
    if (!contractorId || contractorId !== userId) return { allowed: false, isStaff: false };
    const participation = await pool.query(
      `SELECT 1 FROM tender_submission WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
       UNION SELECT 1 FROM tender_interest WHERE tender_id = $1 AND contractor_id = $2
       UNION SELECT 1 FROM tender_contractor WHERE tender_id = $1 AND contractor_id = $2
       UNION SELECT 1 FROM tender_award WHERE tender_id = $1 AND winning_contractor_id = $2
       LIMIT 1`,
      [tenderId, userId]
    );
    return { allowed: participation.rows.length > 0, isStaff: false };
  }

  return { allowed: false, isStaff: false };
}

// ========== TENDER DOCUMENTS (tender_document / tenders/documents/[filename]) ==========
// Any staff (non-Contractor) role can view any tender's documents, matching
// canViewTender's existing convention. A Contractor needs real participation
// on this specific tender - reuses the same submission/interest/
// tender_contractor/award union canAccessTenderMessages already established,
// rather than inventing a second definition of "participates in this tender."
export async function canAccessTenderDocuments(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (!hasRole(roles, ROLE_IDS.CONTRACTOR)) return true;

  const participation = await pool.query(
    `SELECT 1 FROM tender_submission WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
     UNION SELECT 1 FROM tender_interest WHERE tender_id = $1 AND contractor_id = $2
     UNION SELECT 1 FROM tender_contractor WHERE tender_id = $1 AND contractor_id = $2
     UNION SELECT 1 FROM tender_award WHERE tender_id = $1 AND winning_contractor_id = $2
     LIMIT 1`,
    [tenderId, userId]
  );
  return participation.rows.length > 0;
}

// ========== PERMISSION MATRIX (permissions/role_permissions tables) ==========
// Pure resource/action check, driven by the real permissions/role_permissions
// tables — not a ROLE_IDS shortcut. Deliberately does NOT auto-bypass Admin:
// several permissions in this system aren't mapped to any role yet (e.g.
// manage_tender_timings), so baking in a blanket Admin bypass here would
// mask that and make the matrix lie about who actually has access. Callers
// that want "Admin always passes regardless of table state" should combine
// explicitly: `hasRole(roleIds, ROLE_IDS.ADMIN) || await hasPermission(...)`.
// See docs/rbac.md "Still open" — this is deliberately incremental: existing
// ROLE_IDS checks elsewhere in the app are untouched, this only backs the
// permissions this system already has real consumers for.
export async function hasPermission(
  userId: number,
  roleIds: number | number[],
  resource: string,
  action: string
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (roles.length === 0) return false;

  const result = await pool.query(
    `SELECT 1 FROM role_permissions rp
     JOIN permissions p ON p.permission_id = rp.permission_id
     WHERE rp.role_id = ANY($1) AND p.resource = $2 AND p.action = $3
     LIMIT 1`,
    [roles, resource, action]
  );
  return result.rows.length > 0;
}

// ========== DRAFT TENDER VISIBILITY ==========
export async function canViewDraftTender(roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  const allowedRoles: number[] = [ROLE_IDS.ADMIN]; // Admin only by default – add more role IDs here
  return allowedRoles.some(allowed => roles.includes(allowed));
}