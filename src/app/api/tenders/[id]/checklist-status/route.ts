// app/api/tenders/[id]/checklist-status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tenderId = parseInt(id);
  const userId = session.user.id;

  // Fetch checklist acknowledgment from tender_acknowledgments (assuming we store checklist in 'sections' as JSON or a new column)
  // We'll use the existing table: we can store checklist data in a 'checklist' field or reuse 'sections' with a tag.
  // For simplicity, we add a 'checklist' JSONB column to tender_acknowledgment or use a separate table.
  // Let's assume we have a column `checklist_data` in `tender_acknowledgment`.
  // If not, run ALTER TABLE tender_acknowledgment ADD COLUMN checklist_data JSONB;

  const result = await query(
    `SELECT checklist_data FROM tender_acknowledgment
     WHERE tender_id = $1 AND contractor_id = $2`,
    [tenderId, userId]
  );

  if (result.rows.length === 0 || !result.rows[0].checklist_data) {
    return NextResponse.json({ completed: false, selections: {} });
  }

  return NextResponse.json({
    completed: true,
    selections: result.rows[0].checklist_data,
  });
}