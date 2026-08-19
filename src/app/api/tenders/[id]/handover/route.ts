// app/api/tenders/[id]/handover/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS } from "@/lib/roles";
import { canMarkHandover } from "@/lib/permissions";
import { validateBody, handoverSchema, dlpCaseStatusSchema } from "@/lib/validation";
import { computeDlpExpiry, getDlpStatus } from "@/lib/dlp";
import { notifyUsers } from "@/lib/notifications";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- POST — record the actual handover date, starting the DLP clock ----------
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
  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  const allowed = await canMarkHandover(tenderId, user.email, user.roleIds || []);
  if (!allowed) {
    return NextResponse.json(
      { error: "Only an admin or the assigned project manager can record a handover for this tender" },
      { status: 403, headers: corsHeaders }
    );
  }

  const validation = await validateBody(request, handoverSchema);
  if (!validation.success) {
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
  const { handover_date, defect_liability_months, notes } = validation.data;

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const tenderRes = await client.query(
      `SELECT tender_id, tender_name, stage FROM tender WHERE tender_id = $1 AND is_deleted = false FOR UPDATE`,
      [tenderId]
    );
    if (tenderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: corsHeaders });
    }
    if (tenderRes.rows[0].stage !== 3) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Handover can only be recorded for an Awarded tender" },
        { status: 400, headers: corsHeaders }
      );
    }
    const tenderName = tenderRes.rows[0].tender_name;

    // dlp_reminder_sent_at is reset on every write, not just the first one —
    // if the handover date or defect liability period is later corrected
    // (extending the DLP expiry), a stale "already reminded" flag must not
    // suppress a fresh reminder for the new expiry.
    await client.query(
      `UPDATE tender
       SET handover_date = $1, defect_liability_months = $2, handover_by = $3,
           handover_notes = $4, dlp_reminder_sent_at = NULL, updated_at = NOW()
       WHERE tender_id = $5`,
      [handover_date, defect_liability_months, user.id, notes || null, tenderId]
    );

    await client.query("COMMIT");

    const dlpExpiry = computeDlpExpiry(handover_date, defect_liability_months);
    const dlpStatus = getDlpStatus(dlpExpiry);

    // Notification is best-effort and not on the request's critical path —
    // matches tenderLifecycle.ts's notifyAutoTransition convention.
    void (async () => {
      try {
        const adminRes = await query(
          `SELECT user_id FROM users WHERE role_id = $1 AND is_active = true`,
          [ROLE_IDS.ADMIN]
        );
        const adminIds = adminRes.rows.map((r: { user_id: number }) => r.user_id);
        await notifyUsers(
          adminIds,
          "Handover recorded",
          `"${tenderName}" was marked as handed over on ${handover_date}. Defect Liability Period expires ${dlpExpiry.toISOString().slice(0, 10)}.`,
          `/tenders/${tenderId}`
        );
      } catch (err) {
        console.error(`Handover notification failed for tender ${tenderId}:`, err);
      }
    })();

    return NextResponse.json(
      {
        success: true,
        handover_date,
        defect_liability_months,
        dlp_expiry: dlpExpiry.toISOString().slice(0, 10),
        dlp_status: dlpStatus.status,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Handover recording error:", err);
    return NextResponse.json({ error: "Unable to record the handover. Please try again." }, { status: 500, headers: corsHeaders });
  } finally {
    client.release();
  }
}

// ---------- PATCH — set/clear the manual DLP case status override ----------
// Lets an admin or the assigned PM mark an outstanding DLP case as
// "Processing" or "Completed" instead of it perpetually showing "N days
// overdue" once the expiry date has passed. Passing null clears the
// override and reverts the deadlines page to the date-derived status.
export async function PATCH(
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
  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400, headers: corsHeaders });
  }

  const allowed = await canMarkHandover(tenderId, user.email, user.roleIds || []);
  if (!allowed) {
    return NextResponse.json(
      { error: "Only an admin or the assigned project manager can update this DLP case's status" },
      { status: 403, headers: corsHeaders }
    );
  }

  const validation = await validateBody(request, dlpCaseStatusSchema);
  if (!validation.success) {
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
  const { dlp_case_status } = validation.data;

  try {
    const result = await query(
      `UPDATE tender SET dlp_case_status = $1, updated_at = NOW()
       WHERE tender_id = $2 AND is_deleted = false AND stage = 3 AND handover_date IS NOT NULL
       RETURNING tender_id`,
      [dlp_case_status, tenderId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "No active DLP case found for this tender" },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json({ success: true, dlp_case_status }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("DLP case status update error:", err);
    return NextResponse.json({ error: "Unable to update the DLP status. Please try again." }, { status: 500, headers: corsHeaders });
  }
}
