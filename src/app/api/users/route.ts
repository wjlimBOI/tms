import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role");

  let sql = `
    SELECT u.user_id, u.username, up.full_name
    FROM users u
    LEFT JOIN user_profile up ON u.user_id = up.user_id
    WHERE u.is_deleted = false
  `;
  const params: any[] = [];

  if (role === "team_member") {
    sql += ` AND u.is_team_member = true`;
  }

  sql += ` ORDER BY u.username`;

  const result = await query(sql, params);
  return NextResponse.json(result.rows);
}