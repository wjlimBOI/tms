// app/api/tenders/[id]/interest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";
import { logInsert } from "@/lib/audit";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";

const interestBodySchema = z.object({
  interest_note: z.string().max(500).optional().nullable(),
});

// ---------- GET — list interest for a tender ----------
// Admin/staff: full list with contractor details.
// Contractor: only their own record, so the UI can show applied/not-applied state.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenderId = parseInt(id);
    if (isNaN(tenderId)) {
      return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
    }

    const userRoleIds = session.user.roleIds || [];
    const isContractor = userRoleIds.includes(ROLE_IDS.CONTRACTOR);

    if (isContractor) {
      const res = await query(
        `SELECT interest_id, interest_note, is_approved, submitted_at, created_at
         FROM tender_interest
         WHERE tender_id = $1 AND contractor_id = $2`,
        [tenderId, session.user.id]
      );
      return NextResponse.json({ interests: res.rows });
    }

    const res = await query(
      `SELECT ti.interest_id, ti.interest_note, ti.is_approved, ti.submitted_at, ti.created_at,
              u.user_id AS contractor_id, u.username, u.email,
              up.full_name, up.company_name, up.phone
       FROM tender_interest ti
       JOIN users u ON ti.contractor_id = u.user_id
       LEFT JOIN user_profile up ON up.user_id = u.user_id
       WHERE ti.tender_id = $1
       ORDER BY ti.created_at ASC`,
      [tenderId]
    );
    return NextResponse.json({ interests: res.rows });
  } catch (error) {
    console.error("Tender interest GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------- POST — contractor registers interest in a tender ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoleIds = session.user.roleIds || [];
    if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
      return NextResponse.json({ error: "Only contractors can register interest" }, { status: 403 });
    }

    const { id } = await params;
    const tenderId = parseInt(id);
    if (isNaN(tenderId)) {
      return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
    }

    let interestNote: string | null = null;
    try {
      const raw = await request.json();
      const parsed = interestBodySchema.safeParse(raw);
      if (parsed.success) interestNote = parsed.data.interest_note ? sanitize(parsed.data.interest_note) : null;
    } catch {
      // no body / invalid JSON — interest_note is optional, proceed without it
    }

    await applyScheduledTenderTransitions();
    const tenderRes = await query(
      `SELECT ts.status_code FROM tender t
       JOIN tender_status ts ON t.status_id = ts.status_id
       WHERE t.tender_id = $1 AND t.is_deleted = false`,
      [tenderId]
    );
    if (tenderRes.rows.length === 0) {
      return NextResponse.json({ error: "Tender not found" }, { status: 404 });
    }
    if (tenderRes.rows[0].status_code !== "Open") {
      return NextResponse.json({ error: "This tender is not open for interest registration" }, { status: 400 });
    }

    // Atomic upsert-guard: the (tender_id, contractor_id) unique constraint means
    // a concurrent double-click can't create duplicates; ON CONFLICT DO NOTHING
    // avoids a check-then-insert race instead of a separate SELECT first.
    const insertRes = await query(
      `INSERT INTO tender_interest (tender_id, contractor_id, interest_note, submitted_at, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NOW())
       ON CONFLICT (tender_id, contractor_id) DO NOTHING
       RETURNING interest_id`,
      [tenderId, session.user.id, interestNote]
    );

    if (insertRes.rows.length === 0) {
      return NextResponse.json({ error: "You have already registered interest in this tender" }, { status: 409 });
    }

    const interestId = insertRes.rows[0].interest_id;
    await logInsert(
      "tender_interest",
      interestId,
      { tender_id: tenderId, contractor_id: session.user.id },
      session.user.id,
      request,
      { action: "register_interest" }
    );

    return NextResponse.json({ success: true, interest_id: interestId }, { status: 201 });
  } catch (error) {
    console.error("Tender interest POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
