import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, resource_type, resource_id, details, ip_address } = await req.json();

  // Get username from database using user_id (or fallback to email)
  const userRes = await query(`SELECT username, email FROM users WHERE user_id = $1`, [session.user.id]);
  const username = userRes.rows[0]?.username || session.user.email || "unknown";

  await query(
    `INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      session.user.id,
      username,
      action,
      resource_type,
      resource_id,
      JSON.stringify(details || {}),
      ip_address || req.headers.get("x-forwarded-for") || "unknown",
    ]
  );

  return NextResponse.json({ success: true });
}