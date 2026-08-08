// app/api/tenders/[id]/interest/[interestId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";
import { logUpdate } from "@/lib/audit";
import { z } from "zod";

const decisionSchema = z.object({
  approved: z.boolean(),
});

// ---------- PATCH — Admin approves or reverts a contractor's registered interest ----------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; interestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoleIds = session.user.roleIds || [];
    if (!userRoleIds.includes(ROLE_IDS.ADMIN)) {
      return NextResponse.json({ error: "Only admins can approve interest" }, { status: 403 });
    }

    const { id, interestId: interestIdStr } = await params;
    const tenderId = parseInt(id);
    const interestId = parseInt(interestIdStr);
    if (isNaN(tenderId) || isNaN(interestId)) {
      return NextResponse.json({ error: "Invalid tender or interest ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { approved } = parsed.data;

    const existing = await query(
      `SELECT interest_id, is_approved FROM tender_interest WHERE interest_id = $1 AND tender_id = $2`,
      [interestId, tenderId]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Interest record not found for this tender" }, { status: 404 });
    }

    const updated = await query(
      `UPDATE tender_interest
       SET is_approved = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE interest_id = $3
       RETURNING interest_id, is_approved, approved_at`,
      [approved, session.user.id, interestId]
    );

    await logUpdate(
      "tender_interest",
      interestId,
      { is_approved: existing.rows[0].is_approved },
      { is_approved: approved },
      session.user.id,
      request,
      { action: approved ? "approve_interest" : "revoke_interest" }
    );

    return NextResponse.json({ success: true, interest: updated.rows[0] });
  } catch (error) {
    console.error("Tender interest PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
