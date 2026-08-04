import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { signature, acknowledgedSections, checklistData } = await req.json();
  
  if (!signature) {
    return NextResponse.json({ error: "Invalid acknowledgment: signature required" }, { status: 400 });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  const userId = session.user.id;

  const sectionsJson = JSON.stringify(acknowledgedSections || []);
  const checklistJson = checklistData ? JSON.stringify(checklistData) : null;

  await query(
    `INSERT INTO tender_acknowledgment (tender_id, contractor_id, acknowledged_at, signature, sections, checklist_data)
     VALUES ($1, $2, NOW(), $3, $4, $5)
     ON CONFLICT (tender_id, contractor_id) DO UPDATE
     SET acknowledged_at = NOW(), signature = $3, sections = $4, checklist_data = $5`,
    [tenderId, userId, signature, sectionsJson, checklistJson]
  );

  return NextResponse.json({ success: true });
}