import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tenderId = url.searchParams.get("tenderId");
  if (!tenderId) return NextResponse.json({ error: "Missing tenderId" }, { status: 400 });

  const userId = (session.user as any).id;
  const userRoleIds = (session.user as any).roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ error: "Only contractors can check BQ submissions" }, { status: 403 });
  }

  const result = await query(
    `SELECT submission_id, status
     FROM tender_submission
     WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
     ORDER BY round_no DESC LIMIT 1`,
    [tenderId, userId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ exists: false });
  }
  return NextResponse.json({
    exists: true,
    submission_id: result.rows[0].submission_id,
    status: result.rows[0].status,
  });
}