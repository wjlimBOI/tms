import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
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