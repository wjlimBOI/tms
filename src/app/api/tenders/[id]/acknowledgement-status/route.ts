import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  const userId = session.user.id;

  // Use correct table name: tender_acknowledgment (singular)
  const result = await query(
    `SELECT 1 FROM tender_acknowledgment 
     WHERE tender_id = $1 AND contractor_id = $2`,
    [tenderId, userId]
  );
  
  return NextResponse.json({ acknowledged: result.rows.length > 0 });
}