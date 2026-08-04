import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();
  const result = await query(
    `SELECT COUNT(*) FROM tender WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year]
  );
  return NextResponse.json({ count: parseInt(result.rows[0].count) });
}