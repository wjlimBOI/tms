// app/api/brands/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSuperViewer } from "@/lib/roles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isSuperViewer((session.user as any).roleIds || [])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only return brands with ID 1 through 7
  const result = await query(
    `SELECT brand_id, brand_name FROM brand WHERE brand_id BETWEEN 1 AND 7 ORDER BY brand_name`
  );
  return NextResponse.json(result.rows);
}