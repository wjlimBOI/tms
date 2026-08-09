// app/api/tenders/[id]/award/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS } from "@/lib/roles";
import { createNotification, notifyUsers, sendTrackedEmail } from "@/lib/notifications";
import { sendAwardResultEmail } from "@/lib/email";
import { sanitize } from "@/lib/sanitize";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET — eligible (Submitted) submissions for the award picker ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const sessionUser = session.user as any;
  if (!((sessionUser.roleIds || []) as number[]).includes(ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Only admins can view award candidates" }, { status: 403, headers: corsHeaders });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  // Only each contractor's LATEST round is award-eligible - an older round
  // that's still sitting in Submitted/Approved status (because nothing marks
  // a superseded round as such) must never be selectable, or staff could
  // award a bid the contractor has already revised away from.
  const submissionsRes = await query(
    `SELECT ts.submission_id, ts.contractor_id, u.username AS contractor_name,
            ts.submitted_at, ts.status, ts.bq_name
     FROM tender_submission ts
     JOIN users u ON ts.contractor_id = u.user_id
     WHERE ts.tender_id = $1 AND ts.is_deleted = false AND ts.status IN ('Submitted', 'Approved')
       AND ts.round_no = (
         SELECT MAX(round_no) FROM tender_submission
         WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false
       )
     ORDER BY ts.submitted_at ASC`,
    [tenderId]
  );

  const existingAward = await query(
    `SELECT award_id FROM tender_award WHERE tender_id = $1`,
    [tenderId]
  );

  return NextResponse.json(
    { submissions: submissionsRes.rows, alreadyAwarded: existingAward.rows.length > 0 },
    { headers: corsHeaders }
  );
}

// ---------- POST — record the award and close the tender ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const user = session.user as any;
  if (!((user.roleIds || []) as number[]).includes(ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Only admins can award a tender" }, { status: 403, headers: corsHeaders });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const submissionId = parseInt(body.submission_id);
  const contractValue = parseFloat(body.contract_value);
  const remark = typeof body.remark === "string" ? sanitize(body.remark.slice(0, 500)) : null;

  if (isNaN(submissionId) || isNaN(contractValue) || contractValue <= 0) {
    return NextResponse.json(
      { error: "A winning submission and a contract value greater than 0 are required" },
      { status: 400, headers: corsHeaders }
    );
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const tenderRes = await client.query(
      `SELECT tender_id, stage, tender_name, created_by FROM tender WHERE tender_id = $1 AND is_deleted = false FOR UPDATE`,
      [tenderId]
    );
    if (tenderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: corsHeaders });
    }
    if (tenderRes.rows[0].stage !== 2) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "A tender can only be awarded while at the \"Closed\" stage" },
        { status: 400, headers: corsHeaders }
      );
    }
    const tenderName = tenderRes.rows[0].tender_name;
    const tenderCreatedBy = tenderRes.rows[0].created_by;

    const existingAward = await client.query(
      `SELECT award_id FROM tender_award WHERE tender_id = $1`,
      [tenderId]
    );
    if (existingAward.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This tender has already been awarded" }, { status: 409, headers: corsHeaders });
    }

    const submissionRes = await client.query(
      `SELECT submission_id, contractor_id
       FROM tender_submission ts
       WHERE submission_id = $1 AND tender_id = $2 AND is_deleted = false AND status IN ('Submitted', 'Approved')
         AND round_no = (
           SELECT MAX(round_no) FROM tender_submission
           WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false
         )`,
      [submissionId, tenderId]
    );
    if (submissionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "The selected submission was not found for this tender" },
        { status: 400, headers: corsHeaders }
      );
    }
    const winningContractorId = submissionRes.rows[0].contractor_id;

    const awardRes = await client.query(
      `INSERT INTO tender_award
         (tender_id, winning_contractor_id, awarded_by, final_submission_id, awarded_date, contract_value, remark, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, NOW(), NOW())
       RETURNING award_id`,
      [tenderId, winningContractorId, user.id, submissionId, contractValue, remark]
    );

    const statusRes = await client.query(
      `SELECT status_id FROM tender_status WHERE status_code = 'awarded'`
    );
    if (statusRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Awarded status not configured" }, { status: 500, headers: corsHeaders });
    }

    await client.query(
      `UPDATE tender SET stage = 3, status_id = $1, stage_updated_at = NOW(), updated_at = NOW() WHERE tender_id = $2`,
      [statusRes.rows[0].status_id, tenderId]
    );

    await client.query("COMMIT");

    // Notifications/emails must never affect the award response — the award
    // itself already committed. Fire-and-forget, matching tenderLifecycle.ts's
    // existing convention.
    void (async () => {
      try {
        const participantsRes = await query(
          `SELECT DISTINCT ts.contractor_id, u.email, u.username
           FROM tender_submission ts
           JOIN users u ON u.user_id = ts.contractor_id
           WHERE ts.tender_id = $1 AND ts.is_deleted = false
             AND ts.round_no = (
               SELECT MAX(round_no) FROM tender_submission
               WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false
             )`,
          [tenderId]
        );

        for (const p of participantsRes.rows) {
          const won = p.contractor_id === winningContractorId;
          await createNotification(
            p.contractor_id,
            won ? "Tender awarded to you" : "Tender awarded",
            won
              ? `Congratulations — you have been awarded "${tenderName}".`
              : `"${tenderName}" has been awarded to another contractor.`,
            `/tenders/${tenderId}`
          ).catch((err) => console.error(`Award in-app notify failed for contractor ${p.contractor_id}:`, err));

          await sendTrackedEmail("award_result", { userId: p.contractor_id, email: p.email }, tenderId, () =>
            sendAwardResultEmail({
              to: p.email,
              recipientName: p.username,
              tenderName,
              tenderId,
              won,
              contractValue: won ? contractValue : undefined,
            })
          );
        }

        const adminRes = await query(
          `SELECT user_id FROM users WHERE role_id = $1 AND is_active = true`,
          [ROLE_IDS.ADMIN]
        );
        const staffIds = new Set<number>(adminRes.rows.map((r) => r.user_id));
        if (tenderCreatedBy) staffIds.add(tenderCreatedBy);

        await notifyUsers(
          Array.from(staffIds),
          "Tender awarded",
          `"${tenderName}" has been awarded.`,
          `/tenders/${tenderId}`
        ).catch((err) => console.error(`Award staff notify failed for tender ${tenderId}:`, err));
      } catch (err) {
        console.error("Award notification dispatch failed:", err);
      }
    })();

    return NextResponse.json(
      { success: true, award_id: awardRes.rows[0].award_id },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Award tender error:", err);
    return NextResponse.json({ error: "Unable to record the award. Please try again." }, { status: 500, headers: corsHeaders });
  } finally {
    client.release();
  }
}
