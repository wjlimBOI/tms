import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await query(
      `SELECT category_id, category_name as name, sort_order FROM work_category ORDER BY sort_order`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch work categories:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}