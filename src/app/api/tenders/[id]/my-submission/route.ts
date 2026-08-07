// app/api/tenders/[id]/my-submission/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

// Returns the current contractor's own submitted form data for this tender,
// so the read-only tender document view can show what they actually
// submitted instead of a permanently-blank template.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (!((user.roleIds || []) as number[]).includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ submission: null });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  const res = await query(
    `SELECT submission_id, status, submitted_at, submission_data
     FROM tender_submission
     WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false AND status = 'Submitted'
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [tenderId, user.id]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ submission: null });
  }

  return NextResponse.json({
    submission: {
      submission_id: res.rows[0].submission_id,
      submitted_at: res.rows[0].submitted_at,
      data: res.rows[0].submission_data || null,
    },
  });
}
