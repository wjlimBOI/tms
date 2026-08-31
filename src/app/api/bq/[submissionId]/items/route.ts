// app/api/bq/[submissionId]/items/route.ts
//
// Lightweight line-item list for a submission, used by the BQ notes
// composer's item picker (BqNotesPanel) — deliberately minimal (id, item
// number, description only), not the full editable BQTable/BQRow data.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);

  const { submissionId } = await params;
  const subId = parseInt(submissionId);
  if (isNaN(subId)) {
    return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
  }

  const subRes = await query(`SELECT contractor_id FROM tender_submission WHERE submission_id = $1 AND is_deleted = false`, [subId]);
  if (subRes.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (isContractor && subRes.rows[0].contractor_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(
    `WITH numbered_categories AS (
       SELECT category_id, ROW_NUMBER() OVER (ORDER BY sort_order) AS cat_num
       FROM (
         SELECT DISTINCT li.category_id, c.sort_order
         FROM bq_line_item li
         JOIN work_category c ON li.category_id = c.category_id
         WHERE li.submission_id = $1
       ) AS category_ordering
     )
     SELECT li.line_item_id, li.description,
            CONCAT(nc.cat_num, '.', ROW_NUMBER() OVER (PARTITION BY li.category_id ORDER BY li.sort_order)) AS item_no
     FROM bq_line_item li
     JOIN numbered_categories nc ON li.category_id = nc.category_id
     WHERE li.submission_id = $1
     ORDER BY nc.cat_num, li.sort_order`,
    [subId]
  );

  return NextResponse.json(result.rows);
}
