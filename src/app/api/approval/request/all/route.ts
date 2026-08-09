import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { enrichApprovalRows } from "@/lib/approvals";

// "All" is meant as a full history view (any status), distinct from
// /pending's "actionable right now" list — it previously filtered to
// status = 'pending' only, an exact duplicate of /pending's query. Also
// joins on resource_type alone rather than the current step, so a request
// still shows up here for a role after it has moved past that role's step
// (a pure current_step match would hide it the moment it advances).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRoleIds = (session.user as any).roleIds || [];
  const pagination = parsePagination(new URL(req.url).searchParams);

  const baseFrom = `
    FROM (SELECT DISTINCT ar.request_id, ar.resource_type, ar.resource_id, ar.current_step,
                 ar.created_at, ar.status
          FROM approval_requests ar
          JOIN approval_chains ac ON ar.resource_type = ac.resource_type
          WHERE ac.role_id = ANY($1)) ar
  `;

  if (!pagination) {
    const result = await query(
      `SELECT ar.request_id, ar.resource_type, ar.resource_id, ar.current_step, ar.created_at, ar.status
       ${baseFrom}
       ORDER BY ar.created_at DESC`,
      [userRoleIds]
    );
    return NextResponse.json(await enrichApprovalRows(result.rows));
  }

  const countRes = await query(`SELECT COUNT(*) AS total ${baseFrom}`, [userRoleIds]);
  const total = parseInt(countRes.rows[0].total, 10);

  const result = await query(
    `SELECT ar.request_id, ar.resource_type, ar.resource_id, ar.current_step, ar.created_at, ar.status
     ${baseFrom}
     ORDER BY ar.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userRoleIds, pagination.limit, pagination.offset]
  );

  return NextResponse.json({ data: await enrichApprovalRows(result.rows), ...paginationMeta(pagination, total) });
}