// app/api/tenders/my-submission/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const tenderId = url.searchParams.get("tender_id");

  // If a specific tender_id is provided → return submissions for that tender
  if (tenderId) {
    const submissionsSql = `
      SELECT
        ts.submission_id,
        ts.round_no,
        ts.version_name,
        ts.status,
        ts.bq_name,
        ts.created_at,
        ts.updated_at,
        (ts.status = 'Draft') AS can_edit
      FROM tender_submission ts
      WHERE ts.contractor_id = $1
        AND ts.tender_id = $2
        AND ts.is_deleted = false
      ORDER BY ts.round_no DESC, ts.created_at DESC
    `;
    const submissions = await query(submissionsSql, [userId, parseInt(tenderId)]);
    return NextResponse.json(submissions.rows);
  }

  // Return ALL submitted/approved tenders (including closed)
  const aggregatedSql = `
    SELECT DISTINCT
      t.tender_id,
      t.tender_name,
      b.branch_name,
      br.brand_name AS client_name,
      rt.type_name AS work_type,
      t.closing_date,
      t.renovation_start_date,
      t.renovation_end_date,
      ts.label AS tender_status_label,
      CASE
        WHEN ts.label = 'Closed' THEN 'Closed'
        WHEN t.renovation_end_date < CURRENT_DATE THEN 'Closed'
        WHEN ts.label = 'Open' THEN 'Open'
        WHEN t.renovation_start_date <= CURRENT_DATE THEN 'Ongoing'
        ELSE 'Upcoming'
      END AS display_status,
      MAX(tsub.status) AS latest_submission_status,
      MAX(tsub.updated_at) AS last_activity
    FROM tender_submission tsub
    JOIN tender t ON tsub.tender_id = t.tender_id
    JOIN branch b ON t.branch_id = b.branch_id
    JOIN brand br ON b.brand_id = br.brand_id
    JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
    JOIN tender_status ts ON t.status_id = ts.status_id
    WHERE tsub.contractor_id = $1
      AND tsub.is_deleted = false
      AND tsub.status IN ('Submitted', 'Approved')
    GROUP BY t.tender_id, b.branch_name, br.brand_name, rt.type_name,
             t.closing_date, t.renovation_start_date, t.renovation_end_date, ts.label
    ORDER BY last_activity DESC
  `;
  const result = await query(aggregatedSql, [userId]);
  return NextResponse.json(result.rows);
}