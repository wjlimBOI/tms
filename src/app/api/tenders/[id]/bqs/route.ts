import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { isSuperViewer } from "@/lib/roles";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !isSuperViewer((session.user as any)?.roleIds || [])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  try {
    const result = await query(
      `
      SELECT
        ts.submission_id,
        ts.round_no,
        ts.version_name,
        ts.status,
        ts.updated_at,
        ts.created_at,
        ts.bq_date,
        ts.area_size,
        COALESCE(ts.client_name_override, br.brand_name) AS client_name,
        COALESCE(ts.branch_name_override, b.branch_name) AS job_site,
        COALESCE(
          (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
          rt.type_name
        ) AS work_type,
        (SELECT COUNT(*) FROM bq_line_item WHERE submission_id = ts.submission_id) AS line_item_count,
        ts.contractor_id,
        u.username AS contractor_username
      FROM tender_submission ts
      JOIN tender t ON ts.tender_id = t.tender_id
      JOIN branch b ON t.branch_id = b.branch_id
      JOIN brand br ON b.brand_id = br.brand_id
      JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
      JOIN users u ON ts.contractor_id = u.user_id
      WHERE ts.tender_id = $1
        AND ts.is_deleted = false
      ORDER BY ts.round_no DESC, ts.updated_at DESC
      `,
      [tenderId]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching BQs for tender:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}