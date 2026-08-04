import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await query(`SELECT status_id, status_code, label FROM tender_status ORDER BY sort_order`);
  // Cache for 1 hour (3600 seconds) and serve stale data while revalidating for 1 day
  return new NextResponse(JSON.stringify(result.rows), {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json",
    },
  });
}