import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { parsePagination, paginationMeta } from "@/lib/pagination";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRoleIds = (session.user as any).roleIds || [];
  const pagination = parsePagination(new URL(req.url).searchParams);

  const baseFrom = `
    FROM approval_requests ar
    JOIN approval_chains ac ON ar.resource_type = ac.resource_type
    WHERE ar.status = 'pending' AND ac.role_id = ANY($1)
  `;

  if (!pagination) {
    const result = await query(
      `SELECT ar.request_id, ar.resource_type, ar.resource_id, ar.current_step,
              ar.created_at, ar.status, ac.can_approve, ac.can_reject, ac.requires_comment
       ${baseFrom}
       ORDER BY ar.created_at DESC`,
      [userRoleIds]
    );
    return NextResponse.json(result.rows);
  }

  const countRes = await query(`SELECT COUNT(*) AS total ${baseFrom}`, [userRoleIds]);
  const total = parseInt(countRes.rows[0].total, 10);

  const result = await query(
    `SELECT ar.request_id, ar.resource_type, ar.resource_id, ar.current_step,
            ar.created_at, ar.status, ac.can_approve, ac.can_reject, ac.requires_comment
     ${baseFrom}
     ORDER BY ar.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userRoleIds, pagination.limit, pagination.offset]
  );

  return NextResponse.json({ data: result.rows, ...paginationMeta(pagination, total) });
}