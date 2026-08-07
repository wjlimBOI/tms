import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [itemsRes, unreadRes] = await Promise.all([
    query(
      `SELECT notification_id, title, body, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    ),
    query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`, [userId]),
  ]);

  return NextResponse.json({
    notifications: itemsRes.rows,
    unreadCount: parseInt(unreadRes.rows[0].count, 10),
  });
}
