import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [session.user.id]);
  return NextResponse.json({ success: true });
}
