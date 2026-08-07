// app/api/tenders/[id]/submissions/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  // Fetch tender details
  const tenderRes = await query(
    `SELECT t.tender_id, t.tender_name, t.tender_description, 
            b.branch_name, br.brand_name, rt.type_name AS renovation_type,
            ts.label AS status_label
     FROM tender t
     JOIN branch b ON t.branch_id = b.branch_id
     JOIN brand br ON b.brand_id = br.brand_id
     JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );

  if (tenderRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }
  const tender = tenderRes.rows[0];

  // Fetch submissions for this tender
  const submissionsRes = await query(
    `SELECT ts.submission_id, ts.contractor_id, u.username AS contractor_name,
            ts.submitted_at, ts.status, ts.version_name, ts.bq_name,
            ts.created_at, ts.updated_at
     FROM tender_submission ts
     JOIN users u ON ts.contractor_id = u.user_id
     WHERE ts.tender_id = $1 AND ts.is_deleted = false
     ORDER BY ts.created_at DESC`,
    [tenderId]
  );

  return NextResponse.json({
    tender,
    submissions: submissionsRes.rows,
  });
}