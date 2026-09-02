// lib/permissions.ts
import pool from "./db";
import { ROLE_IDS, isSuperUser, isSuperViewer } from "./roles";
import { FINANCE_SENIOR_GM_EMAIL } from "./tenderConstants";

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

  if (isSuperUser(roles)) {
    return true;
  }
  if (!hasRole(roles, ROLE_IDS.CONTRACTOR)) {
    return false;
  }

  // Once a tender closes, no more submissions — staff move into reviewing
  // what was submitted, comparing pricing across contractors, and
  // negotiating before awarding (2026-08-10). A contractor editing or
  // submitting a Draft BQ after Closed would undermine that comparison, so
  // this is gated on tender status, not just submission status. The one
  // exception: a specific resubmission_request targeting exactly this round
  // (staff-initiated after negotiation) reopens editing for that round only.
  const result = await pool.query(
    `SELECT ts.tender_id, ts.status, ts.round_no, ts.contractor_id, tstat.status_code,
            (SELECT MAX(round_no) FROM tender_submission
             WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id
               AND is_deleted = false) as max_round
     FROM tender_submission ts
     JOIN tender t ON t.tender_id = ts.tender_id
     JOIN tender_status tstat ON tstat.status_id = t.status_id
     WHERE ts.submission_id = $1 AND ts.is_deleted = false`,
    [submissionId]
  );
  if (result.rows.length === 0) {
    return false;
  }
  const sub = result.rows[0];
  const ownsSubmission = sub.contractor_id === userId;
  const isDraft = sub.status === 'Draft';
  const isLatest = sub.round_no === sub.max_round;
  let tenderStillOpen = sub.status_code === 'Open';

  if (!tenderStillOpen && ownsSubmission) {
    const grantRes = await pool.query(
      `SELECT 1 FROM resubmission_request
       WHERE tender_id = $1 AND contractor_id = $2 AND next_round_no = $3
       LIMIT 1`,
      [sub.tender_id, sub.contractor_id, sub.round_no]
    );
    tenderStillOpen = grantRes.rows.length > 0;
  }

  return ownsSubmission && isDraft && isLatest && tenderStillOpen;
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
  if (isSuperViewer(roles)) return true;

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
  if (isSuperUser(roles)) return true;
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
  return isSuperUser(roleIds);
}

// ========== CONTRACTOR CLOSED/AWARDED TENDER PARTICIPATION CHECK ==========
// A contractor who never participated in a tender loses visibility once it
// stops being Open — both once it's Closed (pending an award decision) and
// once it's Awarded (2026-08-10 decision: non-participants must not be able
// to see an awarded tender at all; participants who didn't win keep it as a
// historical record). Participation uses the same submission/interest/
// tender_contractor/award union as canAccessTenderMessages and
// canAccessTenderDocuments, for one consistent definition of "participates
// in this tender" across the app.
export async function canViewTenderWithParticipation(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  // Admin and any non-contractor roles can view any tender
  if (!hasRole(roles, ROLE_IDS.CONTRACTOR)) return true; // only contractors need further checks

  // Contractor: first check if tender is still open
  const tenderRes = await pool.query(
    `SELECT ts.status_code FROM tender t
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) return false;
  const statusCode = tenderRes.rows[0].status_code;

  if (statusCode !== 'closed' && statusCode !== 'awarded') return true;

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

export async function canAccessSubmission(
  submissionId: number,
  userId: number,
  roleIds: number | number[],
  options?: { userEmail?: string | null; forFinance?: boolean }
): Promise<boolean> {
  // Fetch basic submission ownership info
  const result = await pool.query(
    `SELECT tender_id, contractor_id
     FROM tender_submission
     WHERE submission_id = $1 AND is_deleted = false`,
    [submissionId]
  );
  if (result.rows.length === 0) return false;
  const { tender_id: tenderId, contractor_id: contractorId } = result.rows[0];

  // Owner always has access
  if (contractorId === userId) return true;

  // Finance-specific branch (used only by finance-summary route when
  // options?.forFinance === true). This enforces the tightened rule:
  // Admins (isSuperUser) OR the FINANCE_SENIOR_GM_EMAIL may access.
  if (options?.forFinance) {
    const roles = normalizeRoleIds(roleIds);
    if (isSuperUser(roles)) return true;
    const userEmail = options.userEmail;
    if (!userEmail) return false;
    return userEmail.toLowerCase() === FINANCE_SENIOR_GM_EMAIL.toLowerCase();
  }

  // Default (non-finance) behaviour: fall back to existing tender participation check
  return canViewTenderWithParticipation(tenderId, userId, roleIds);
}

export async function hasContractorParticipated(tenderId: number, contractorId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM tender_submission WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
     UNION SELECT 1 FROM tender_interest WHERE tender_id = $1 AND contractor_id = $2
     UNION SELECT 1 FROM tender_contractor WHERE tender_id = $1 AND contractor_id = $2
     UNION SELECT 1 FROM tender_award WHERE tender_id = $1 AND winning_contractor_id = $2
     LIMIT 1`,
    [tenderId, contractorId]
  );
  return result.rows.length > 0;
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
  if (isSuperUser(roles)) return true;
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

  // Full staff bypass (view + reply) for Admin/Developer only — Executive
  // Director's oversight access is view-only elsewhere in this file, and
  // isStaff here also grants the ability to post/reply, not just read.
  if (isSuperUser(roles)) return { allowed: true, isStaff: true };
  if (hasRole(roles, ROLE_IDS.EXECUTIVE_DIRECTOR)) return { allowed: true, isStaff: false };

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

    // Once a tender is awarded, only the winning contractor keeps chat
    // access — everyone else is notified of the outcome by email
    // (award/route.ts) and is expected to reach out by email/WhatsApp for
    // anything further, to keep in-app data minimal (2026-08-10 decision).
    // While still Open or Closed-but-unawarded, any participant can chat.
    const awardRes = await pool.query(
      `SELECT winning_contractor_id FROM tender_award WHERE tender_id = $1`,
      [tenderId]
    );
    if (awardRes.rows.length > 0) {
      return { allowed: awardRes.rows[0].winning_contractor_id === userId, isStaff: false };
    }

    const participation = await pool.query(
      `SELECT 1 FROM tender_submission WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
       UNION SELECT 1 FROM tender_interest WHERE tender_id = $1 AND contractor_id = $2
       UNION SELECT 1 FROM tender_contractor WHERE tender_id = $1 AND contractor_id = $2
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
// AND the tender must still be Open — once it's Closed or Awarded, document
// access is cut off for every contractor, no exception even for the
// eventual winner (2026-08-10 decision: reduce foul-play/manipulation risk
// by not letting anyone keep pulling tender documents after bidding closes).
// This is deliberately stricter than canAccessTenderMessages/
// canViewTenderWithParticipation, which keep participants' visibility as a
// historical record after closing — documents specifically do not get that
// grace period.
export async function canAccessTenderDocuments(
  tenderId: number,
  userId: number,
  roleIds: number | number[]
): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (!hasRole(roles, ROLE_IDS.CONTRACTOR)) return true;

  const tenderRes = await pool.query(
    `SELECT ts.status_code FROM tender t
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) return false;
  if (tenderRes.rows[0].status_code !== 'Open') return false;

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

// ========== TENDER EXTENSION (EOT) APPROVAL ==========
// Deliberately NOT bypassed by isSuperUser (Admin/Developer) — per project
// decision (2026-08-10), EOT approval stays purely role-configurable via
// `tender_extension_settings` (already has a real admin CRUD API at
// /api/admin/extension-settings) rather than getting a hardcoded escape
// hatch. Falls back to FM Regional Director if no settings row exists yet,
// matching the fallback already used for the approval-notification email
// list in src/app/api/tender-extension/route.ts.
export async function getExtensionApproverRoleIds(): Promise<number[]> {
  const result = await pool.query(
    `SELECT role_id FROM tender_extension_settings WHERE is_approver = true`
  );
  const roleIds = result.rows.map((r: { role_id: number }) => r.role_id);
  return roleIds.length > 0 ? roleIds : [ROLE_IDS.FM_REGIONAL_DIRECTOR];
}

export async function canApproveExtension(roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  const approverRoleIds = await getExtensionApproverRoleIds();
  return roles.some((r) => approverRoleIds.includes(r));
}

// ========== TENDER AWARD APPROVAL ==========
// Mirrors the EOT-approval pattern above exactly (2026-08-12 decision):
// deliberately NOT bypassed by isSuperUser (Admin/Developer) — Award moves
// to FM Regional Director exclusively, role-configurable via
// `tender_award_settings` (admin CRUD at /api/admin/award-settings) rather
// than hardcoded. Falls back to FM Regional Director if no settings row
// exists yet.
export async function getAwardApproverRoleIds(): Promise<number[]> {
  const result = await pool.query(
    `SELECT role_id FROM tender_award_settings WHERE is_approver = true`
  );
  const roleIds = result.rows.map((r: { role_id: number }) => r.role_id);
  return roleIds.length > 0 ? roleIds : [ROLE_IDS.FM_REGIONAL_DIRECTOR];
}

export async function canApproveAward(roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  const approverRoleIds = await getAwardApproverRoleIds();
  return roles.some((r) => approverRoleIds.includes(r));
}

// ========== BRANCH REFERENCE-DATA MANAGEMENT ==========
// Viewing (GET) is separate from managing (POST/PUT/DELETE) so Executive
// Director's oversight bypass can see branches without also being able to
// create/edit/delete them.
export async function canViewBranches(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperViewer(roles)) return true;
  return hasPermission(userId, roles, "Admin", "manage_branches");
}

export async function canManageBranches(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperUser(roles)) return true;
  return hasPermission(userId, roles, "Admin", "manage_branches");
}

// ========== PROJECT-MANAGER REFERENCE-DATA MANAGEMENT ==========
export async function canManageProjectManagers(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperUser(roles)) return true;
  return hasPermission(userId, roles, "Admin", "manage_project_managers");
}

// ========== DRAFT TENDER VISIBILITY ==========
export async function canViewDraftTender(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperViewer(roles)) return true;
  return hasPermission(userId, roles, "Tender Management", "view_draft_tenders");
}

// ========== FINANCE SUMMARY / RESUBMISSION / DOCUMENT UPLOAD / SAVED COMPARISON ==========
// Permission-table-backed as of 2026-08-14 (previously hardcoded ROLE_IDS
// checks duplicated across each route's own file — see docs/rbac.md "Still
// open"). Role mappings seeded to match what each check already allowed, so
// this is a mechanism change, not a behavior change.
export async function canGenerateFinanceSummary(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperUser(roles)) return true;
  return hasPermission(userId, roles, "BQ", "generate_finance_summary");
}

export async function canRequestResubmission(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperUser(roles)) return true;
  return hasPermission(userId, roles, "Tender Management", "request_resubmission");
}

// Still Admin/Developer-only in practice today (no role has been granted
// this permission — see docs/pending-migrations.md/rbac notes on why:
// no per-tender authorization model exists yet for uploads). Wired through
// hasPermission() anyway so it's manageable via Role Permissions once that
// model exists, without another code change.
export async function canUploadTenderDocument(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperUser(roles)) return true;
  return hasPermission(userId, roles, "Tender Management", "upload_tender_document");
}

// De-duplicated from two near-identical copies previously in
// tenders/[id]/comparison/route.ts and .../comparison/items/[itemId]/route.ts.
export async function canManageSavedComparison(userId: number, roleIds: number | number[]): Promise<boolean> {
  const roles = normalizeRoleIds(roleIds);
  if (isSuperUser(roles)) return true;
  return hasPermission(userId, roles, "BQ", "manage_saved_comparison");
}
