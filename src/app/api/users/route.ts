import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { parsePagination, paginationMeta } from "@/lib/pagination";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const pagination = parsePagination(url.searchParams);

  let whereClause = `WHERE u.is_deleted = false`;
  const params: any[] = [];
  if (role === "team_member") {
    whereClause += ` AND u.is_team_member = true`;
  }
  const baseFrom = `FROM users u LEFT JOIN user_profile up ON u.user_id = up.user_id ${whereClause}`;

  if (!pagination) {
    const result = await query(
      `SELECT u.user_id, u.username, up.full_name ${baseFrom} ORDER BY u.username`,
      params
    );
    return NextResponse.json(result.rows);
  }

  const countRes = await query(`SELECT COUNT(*) AS total ${baseFrom}`, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const dataParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `SELECT u.user_id, u.username, up.full_name ${baseFrom}
     ORDER BY u.username
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return NextResponse.json({ data: result.rows, ...paginationMeta(pagination, total) });
}