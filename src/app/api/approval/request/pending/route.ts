import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any).role_id;

  const result = await query(
    `SELECT ar.request_id, ar.resource_type, ar.resource_id, ar.current_step,
            ar.created_at, ar.status, ac.can_approve, ac.can_reject, ac.requires_comment
     FROM approval_requests ar
     JOIN approval_chains ac ON ar.resource_type = ac.resource_type AND ar.current_step = ac.step_order
     WHERE ar.status = 'pending' AND ac.role_id = $1
     ORDER BY ar.created_at DESC`,
    [userRole]
  );
  return NextResponse.json(result.rows);
}