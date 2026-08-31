// app/api/tender-interest/respond/route.ts
//
// Public, unauthenticated endpoint — a contractor reaches this via the
// one-time token link in their invitation email, without logging in. The
// token alone resolves which tender/contractor this is for; no caller-
// supplied tender/contractor ID is trusted. Every failure path (invalid,
// expired, already used, tender no longer open) returns the same generic
// error so the response can't be used to enumerate tokens or tender state.
import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { query, getClient } from "@/lib/db";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractAuditContext, logUpdate } from "@/lib/audit";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { z } from "zod";

const GENERIC_ERROR = "This invitation link is invalid or has expired.";

const respondSchema = z.object({
  token: z.string().min(1).max(64),
  action: z.enum(["accept", "decline"]),
});

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET — look up an invitation by token, for the landing page to render ----------
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const { ipAddress } = extractAuditContext(request);
  const { success } = await checkRateLimit(`invite-respond-lookup:${ipAddress}`);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders });
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400, headers: corsHeaders });
  }
  const sanitisedToken = sanitize(token);

  const res = await query(
    `SELECT ti.interest_id, ti.submitted_at, ti.declined_at, t.tender_name, t.tender_id,
            COALESCE(up.full_name, u.display_name, u.username) AS contractor_name
     FROM tender_interest ti
     JOIN tender t ON t.tender_id = ti.tender_id
     JOIN users u ON u.user_id = ti.contractor_id
     LEFT JOIN user_profile up ON up.user_id = u.user_id
     WHERE ti.invite_token = $1
       AND ti.invite_token_used_at IS NULL
       AND ti.invite_token_expires_at > NOW()`,
    [sanitisedToken]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ valid: false, error: GENERIC_ERROR }, { status: 200, headers: corsHeaders });
  }

  const row = res.rows[0];
  return NextResponse.json(
    { valid: true, tenderName: row.tender_name, contractorName: row.contractor_name },
    { headers: corsHeaders }
  );
}

// ---------- POST — accept or decline an invitation by token ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const { ipAddress } = extractAuditContext(request);
  const { success } = await checkRateLimit(`invite-respond:${ipAddress}`);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders });
  }

  const raw = await request.json().catch(() => null);
  const parsed = respondSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400, headers: corsHeaders });
  }
  const sanitisedToken = sanitize(parsed.data.token);
  const { action } = parsed.data;

  await applyScheduledTenderTransitions();

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `SELECT ti.interest_id, ti.tender_id, ti.contractor_id, ti.invited_by, ts.status_code
       FROM tender_interest ti
       JOIN tender t ON t.tender_id = ti.tender_id
       JOIN tender_status ts ON t.status_id = ts.status_id
       WHERE ti.invite_token = $1
         AND ti.invite_token_used_at IS NULL
         AND ti.invite_token_expires_at > NOW()
       FOR UPDATE OF ti`,
      [sanitisedToken]
    );

    if (res.rows.length === 0 || res.rows[0].status_code !== "Open") {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 400, headers: corsHeaders });
    }

    const invite = res.rows[0];

    if (action === "accept") {
      await client.query(
        `UPDATE tender_interest
         SET submitted_at = NOW(), invite_token_used_at = NOW(),
             is_approved = true, approved_by = invited_by, approved_at = NOW(),
             updated_at = NOW()
         WHERE interest_id = $1`,
        [invite.interest_id]
      );
    } else {
      await client.query(
        `UPDATE tender_interest
         SET declined_at = NOW(), invite_token_used_at = NOW(), updated_at = NOW()
         WHERE interest_id = $1`,
        [invite.interest_id]
      );
    }

    await client.query("COMMIT");

    await logUpdate(
      "tender_interest",
      invite.interest_id,
      { invite_token_used_at: null },
      { action },
      invite.contractor_id,
      request,
      { action: action === "accept" ? "accept_invitation" : "decline_invitation" }
    );

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Invitation respond error:", error);
    return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 500, headers: corsHeaders });
  } finally {
    client.release();
  }
}
