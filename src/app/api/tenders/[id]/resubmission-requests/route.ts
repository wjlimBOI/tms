// app/api/tenders/[id]/resubmission-requests/route.ts
//
// Staff-initiated "please submit a revised quote" workflow, used after a
// tender closes while staff review/compare pricing and negotiate before
// awarding (2026-08-10). Writes to the real submission_review +
// resubmission_request tables (schema already existed, unused until now).
// The actual resubmission-window exception this grants is enforced in
// src/lib/permissions.ts's canEditSubmission and src/app/api/bq/version/
// route.ts — this route only creates the grant and notifies.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { createNotification, notifyUsers, sendTrackedEmail } from "@/lib/notifications";
import { sendResubmissionRequestEmail } from "@/lib/email";
import { sanitize } from "@/lib/sanitize";
import { logInsert } from "@/lib/audit";
import { canRequestResubmission } from "@/lib/permissions";
import { ROLE_IDS } from "@/lib/roles";

const createSchema = z.object({
  submission_id: z.number().int().positive(),
  instructions: z.string().max(2000).optional().nullable(),
  due_by: z.string().datetime({ offset: true }).optional().nullable(),
});

// ---------- GET — list resubmission requests for a tender (staff-only) ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];
  if (!(await canRequestResubmission(userId, roleIds))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  const result = await query(
    `SELECT rr.request_id, rr.contractor_id, rr.next_round_no, rr.instructions,
            rr.contractor_notified, rr.notified_at, rr.due_by, rr.created_at,
            u.username AS contractor_username,
            (SELECT MAX(round_no) FROM tender_submission
             WHERE tender_id = rr.tender_id AND contractor_id = rr.contractor_id AND is_deleted = false) AS current_max_round
     FROM resubmission_request rr
     JOIN users u ON u.user_id = rr.contractor_id
     WHERE rr.tender_id = $1
     ORDER BY rr.created_at DESC`,
    [tenderId]
  );

  const rows = result.rows.map((r) => ({
    ...r,
    // Fulfilled once the contractor has actually created the requested round.
    fulfilled: r.current_max_round >= r.next_round_no,
  }));

  return NextResponse.json(rows);
}

// ---------- POST — request a resubmission from a specific contractor ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roleIds = (session.user as any)?.roleIds || [];
  const requesterId = (session.user as any).id;
  if (!(await canRequestResubmission(requesterId, roleIds))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validation = createSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Validation failed", details: validation.error.issues }, { status: 400 });
  }
  const { submission_id, due_by } = validation.data;
  const instructions = validation.data.instructions ? sanitize(validation.data.instructions) : null;

  // 1. Fetch and validate the submission belongs to this tender, and the
  //    tender is actually closed (no point requesting a resubmission while
  //    it's still Open — the contractor can just edit their Draft directly).
  const subRes = await query(
    `SELECT ts.submission_id, ts.tender_id, ts.contractor_id, ts.round_no, ts.status,
            t.tender_name, tstat.status_code,
            u.username AS contractor_username, u.email AS contractor_email,
            (SELECT MAX(round_no) FROM tender_submission
             WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false) AS max_round
     FROM tender_submission ts
     JOIN tender t ON t.tender_id = ts.tender_id
     JOIN tender_status tstat ON tstat.status_id = t.status_id
     JOIN users u ON u.user_id = ts.contractor_id
     WHERE ts.submission_id = $1 AND ts.is_deleted = false`,
    [submission_id]
  );
  if (subRes.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const sub = subRes.rows[0];
  if (sub.tender_id !== tenderId) {
    return NextResponse.json({ error: "Submission does not belong to this tender" }, { status: 400 });
  }
  if (sub.status_code === "Open") {
    return NextResponse.json(
      { error: "This tender is still Open — the contractor can edit their Draft directly, no resubmission request needed." },
      { status: 400 }
    );
  }

  // 2. Compute this contractor's relative standing among all Submitted bids
  //    on this tender, for the notification wording — never expose exact
  //    competitor figures, only "higher"/"lower"/"mixed".
  const totalsRes = await query(
    `SELECT ts.contractor_id, SUM(bli.amount) AS total
     FROM tender_submission ts
     JOIN bq_line_item bli ON bli.submission_id = ts.submission_id
     WHERE ts.tender_id = $1 AND ts.is_deleted = false
       AND ts.status IN ('Submitted', 'Approved')
       AND ts.round_no = (
         SELECT MAX(round_no) FROM tender_submission
         WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false
       )
     GROUP BY ts.contractor_id`,
    [tenderId]
  );
  const totals: { contractor_id: number; total: number }[] = totalsRes.rows.map((r) => ({
    contractor_id: r.contractor_id,
    total: Number(r.total),
  }));
  const thisTotal = totals.find((t) => t.contractor_id === sub.contractor_id)?.total;
  const others = totals.filter((t) => t.contractor_id !== sub.contractor_id).map((t) => t.total);
  let standing: "higher" | "lower" | "mixed" = "mixed";
  if (thisTotal != null && others.length > 0) {
    const higherThanAll = others.every((o) => thisTotal > o);
    const lowerThanAll = others.every((o) => thisTotal < o);
    standing = higherThanAll ? "higher" : lowerThanAll ? "lower" : "mixed";
  }
  const rank = thisTotal != null ? [...totals].sort((a, b) => a.total - b.total).findIndex((t) => t.contractor_id === sub.contractor_id) + 1 : null;

  const nextRoundNo = (sub.max_round || sub.round_no) + 1;

  // 3. Create the review + the resubmission_request grant.
  const reviewRes = await query(
    `INSERT INTO submission_review (submission_id, reviewed_by, review_role, review_status)
     VALUES ($1, $2, $3, $4)
     RETURNING review_id`,
    [submission_id, requesterId, "Negotiation", "Resubmission Requested"]
  );
  const reviewId = reviewRes.rows[0].review_id;

  const reqRes = await query(
    `INSERT INTO resubmission_request
       (tender_id, contractor_id, requested_by, requested_from_review_id, next_round_no, instructions, due_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING request_id`,
    [tenderId, sub.contractor_id, requesterId, reviewId, nextRoundNo, instructions, due_by || null]
  );
  const requestId = reqRes.rows[0].request_id;

  await logInsert(
    "resubmission_request",
    requestId,
    { tender_id: tenderId, contractor_id: sub.contractor_id, next_round_no: nextRoundNo, instructions },
    requesterId,
    request,
    { action: "request_resubmission", tender_id: tenderId, submission_id, source: "api" }
  );

  // 4. Notify — contractor gets the masked high/low nudge, staff get an
  //    internal record. Never blocks the response; matches the
  //    fire-and-forget convention used for award notifications.
  void (async () => {
    try {
      await createNotification(
        sub.contractor_id,
        "Revised quote requested",
        `Please review and submit a revised quote for "${sub.tender_name}".`,
        `/tenders/${tenderId}`
      );
      await sendTrackedEmail(
        "resubmission_request",
        { userId: sub.contractor_id, email: sub.contractor_email },
        tenderId,
        (ccEmails) =>
          sendResubmissionRequestEmail({
            to: sub.contractor_email,
            recipientName: sub.contractor_username,
            tenderName: sub.tender_name,
            tenderId,
            standing,
            instructions,
            dueBy: due_by ? new Date(due_by).toLocaleDateString() : null,
            cc: ccEmails,
          }),
        "alerts"
      );
      await query(
        `UPDATE resubmission_request SET contractor_notified = true, notified_at = NOW() WHERE request_id = $1`,
        [requestId]
      );

      const staffRes = await query(`SELECT user_id FROM users WHERE role_id = $1 AND is_active = true`, [ROLE_IDS.ADMIN]);
      const staffIds = new Set<number>(staffRes.rows.map((r: { user_id: number }) => r.user_id));
      staffIds.add(requesterId);
      await notifyUsers(
        Array.from(staffIds),
        "Resubmission requested",
        `${sub.contractor_username} (rank ${rank ?? "—"} of ${totals.length}) was asked to resubmit for "${sub.tender_name}".`,
        `/tenders/${tenderId}`
      );
    } catch (err) {
      console.error(`Resubmission-request notification dispatch failed for request ${requestId}:`, err);
    }
  })();

  return NextResponse.json(
    { success: true, request_id: requestId, next_round_no: nextRoundNo, standing, rank, of: totals.length },
    { status: 201 }
  );
}
