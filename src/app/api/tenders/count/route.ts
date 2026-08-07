import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();
  const result = await query(
    `SELECT COUNT(*) FROM tender WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year]
  );
  return NextResponse.json({ count: parseInt(result.rows[0].count) });
}