import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id;

  const sql = `
    SELECT 
      t.tender_id,
      t.tender_name,
      t.tender_description,
      b.branch_name,
      br.brand_name,
      rt.type_name AS renovation_type,
      ts.label AS status_label,
      t.tender_date,
      t.renovation_start_date,
      t.renovation_end_date,
      t.closing_date
    FROM tender t
    JOIN branch b ON t.branch_id = b.branch_id
    JOIN brand br ON b.brand_id = br.brand_id
    JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
    JOIN tender_status ts ON t.status_id = ts.status_id
    WHERE t.is_deleted = false
      AND t.created_by = $1
    ORDER BY t.closing_date ASC
  `;

  const result = await query(sql, [userId]);
  return NextResponse.json(result.rows);
}