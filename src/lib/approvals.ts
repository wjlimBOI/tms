// lib/approvals.ts
// Shared helpers for the internal-staff approval-chain runtime
// (approval_requests/approval_chains) — previously fully scaffolded
// (config UI at admin/security's Workflow Config tab, a working
// approve/reject/pending/all API) but with zero real triggers anywhere in
// the app, so nothing ever actually created a request.
//
// This is deliberately a non-blocking, side-channel sign-off trail, not a
// gate: it must never delay, block, or change the outcome of the tender/BQ
// action it's attached to. The tender.stage lifecycle already had an
// internal-review gating workflow and it was intentionally removed (see
// AGENTS.md section 7) — this must not reintroduce that.
import { query } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";

// Creates a pending approval_requests row for (resourceType, resourceId) and
// notifies the first step's role — but only if an admin has actually
// configured a chain for this resource_type (admin/security > Workflow
// Config). No chain configured means no-op, by design: this feature must
// stay silent/inert for any resource_type nobody has opted into.
export async function createApprovalRequestIfConfigured(
  resourceType: string,
  resourceId: number,
  requesterId: number | null,
  resourceLabel: string,
  link: string
): Promise<void> {
  try {
    const chainRes = await query(
      `SELECT ac.role_id, r.role_name
       FROM approval_chains ac
       LEFT JOIN roles r ON r.role_id = ac.role_id
       WHERE ac.resource_type = $1
       ORDER BY ac.step_order ASC
       LIMIT 1`,
      [resourceType]
    );
    if (chainRes.rows.length === 0) return;

    // Avoid creating a second active request for the same resource (e.g. a
    // BQ header PUT that re-saves status = 'Submitted' without changing it).
    const existing = await query(
      `SELECT request_id FROM approval_requests
       WHERE resource_type = $1 AND resource_id = $2 AND status = 'pending'`,
      [resourceType, resourceId]
    );
    if (existing.rows.length > 0) return;

    await query(
      `INSERT INTO approval_requests (resource_type, resource_id, requester_id, current_step, status)
       VALUES ($1, $2, $3, 1, 'pending')`,
      [resourceType, resourceId, requesterId]
    );

    const firstStep = chainRes.rows[0];
    if (firstStep.role_id) {
      const approverRes = await query(
        `SELECT DISTINCT u.user_id
         FROM user_roles ur
         JOIN users u ON u.user_id = ur.user_id
         WHERE ur.role_id = $1 AND u.is_active = true AND u.is_deleted = false`,
        [firstStep.role_id]
      );
      const approverIds = approverRes.rows.map((r: { user_id: number }) => r.user_id);
      await notifyUsers(approverIds, "Approval required", `${resourceLabel} is awaiting your sign-off.`, link);
    }
  } catch (err) {
    // Best-effort, never on the critical path — the tender/BQ action this
    // is attached to must always succeed independent of this side channel.
    console.error(`Failed to create approval request for ${resourceType}#${resourceId}:`, err);
  }
}

export interface ApprovalRequestRow {
  request_id: number;
  resource_type: string;
  resource_id: number;
  current_step: number | null;
  created_at: string;
  status: string;
  [key: string]: unknown;
}

export interface EnrichedApprovalRow extends ApprovalRequestRow {
  resource_label: string;
  link: string | null;
}

// Turns a raw resource_type/resource_id pair into a human-readable label +
// link — without this, the approvals inbox is just an unreadable list of
// numbers. Batches lookups per resource_type instead of one query per row.
export async function enrichApprovalRows(rows: ApprovalRequestRow[]): Promise<EnrichedApprovalRow[]> {
  const tenderCreationIds = [...new Set(rows.filter((r) => r.resource_type === "tender_creation").map((r) => r.resource_id))];
  const submissionIds = [
    ...new Set(rows.filter((r) => r.resource_type === "tender_submission" || r.resource_type === "bq_submission").map((r) => r.resource_id)),
  ];

  const tenderMap = new Map<number, string>();
  if (tenderCreationIds.length > 0) {
    const res = await query(`SELECT tender_id, tender_name FROM tender WHERE tender_id = ANY($1)`, [tenderCreationIds]);
    for (const row of res.rows) tenderMap.set(row.tender_id, row.tender_name);
  }

  const submissionMap = new Map<number, { tender_id: number; tender_name: string; bq_name: string | null }>();
  if (submissionIds.length > 0) {
    const res = await query(
      `SELECT ts.submission_id, ts.tender_id, ts.bq_name, t.tender_name
       FROM tender_submission ts
       JOIN tender t ON t.tender_id = ts.tender_id
       WHERE ts.submission_id = ANY($1)`,
      [submissionIds]
    );
    for (const row of res.rows) submissionMap.set(row.submission_id, row);
  }

  return rows.map((r) => {
    if (r.resource_type === "tender_creation") {
      const tenderName = tenderMap.get(r.resource_id);
      return {
        ...r,
        resource_label: tenderName ? `New tender "${tenderName}"` : `Tender #${r.resource_id}`,
        link: `/tenders/${r.resource_id}`,
      };
    }
    if (r.resource_type === "tender_submission") {
      const s = submissionMap.get(r.resource_id);
      return {
        ...r,
        resource_label: s ? `Bid submission for "${s.tender_name}"` : `Submission #${r.resource_id}`,
        link: s ? `/tenders/${s.tender_id}/submissions` : null,
      };
    }
    if (r.resource_type === "bq_submission") {
      const s = submissionMap.get(r.resource_id);
      return {
        ...r,
        resource_label: s ? `${s.bq_name || "BQ"} for "${s.tender_name}"` : `BQ #${r.resource_id}`,
        link: s ? `/bq/${r.resource_id}/view` : null,
      };
    }
    return { ...r, resource_label: `${r.resource_type} #${r.resource_id}`, link: null };
  });
}
