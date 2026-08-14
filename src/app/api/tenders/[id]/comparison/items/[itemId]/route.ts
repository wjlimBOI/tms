// app/api/tenders/[id]/comparison/items/[itemId]/route.ts
//
// Edit a single contractor's per-comparison note (reno_comparison_item.reno_notes).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { ROLE_IDS, isSuperUser } from "@/lib/roles";
import { sanitize } from "@/lib/sanitize";
import { logUpdate } from "@/lib/audit";

function canManageComparison(roleIds: number[]): boolean {
  return (
    isSuperUser(roleIds) ||
    roleIds.includes(ROLE_IDS.PROJECT_MANAGER) ||
    roleIds.includes(ROLE_IDS.SENIOR_PROJECT_MANAGER) ||
    roleIds.includes(ROLE_IDS.FINANCE_MANAGER) ||
    roleIds.includes(ROLE_IDS.FINANCE_GENERAL_MANAGER) ||
    roleIds.includes(ROLE_IDS.FINANCE_TEAM)
  );
}

const updateSchema = z.object({
  reno_notes: z.string().max(2000).nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];
  if (!canManageComparison(roleIds)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, itemId } = await params;
  const tenderId = parseInt(id);
  const itemIdNum = parseInt(itemId);
  if (isNaN(tenderId) || isNaN(itemIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Validation failed", details: validation.error.issues }, { status: 400 });
  }
  const notes = validation.data.reno_notes ? sanitize(validation.data.reno_notes) : null;

  // Verify the item actually belongs to this tender's comparison.
  const itemRes = await query(
    `SELECT rci.item_id, rci.reno_notes AS old_notes
     FROM reno_comparison_item rci
     JOIN reno_comparison rc ON rc.comparison_id = rci.comparison_id
     WHERE rci.item_id = $1 AND rc.tender_id = $2`,
    [itemIdNum, tenderId]
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: "Comparison item not found" }, { status: 404 });
  }

  const updated = await query(
    `UPDATE reno_comparison_item SET reno_notes = $1, updated_at = NOW() WHERE item_id = $2 RETURNING item_id, reno_notes`,
    [notes, itemIdNum]
  );

  await logUpdate(
    "reno_comparison_item",
    itemIdNum,
    { reno_notes: itemRes.rows[0].old_notes },
    { reno_notes: notes },
    userId,
    request,
    { action: "update_comparison_note", tender_id: tenderId, source: "api" }
  );

  return NextResponse.json(updated.rows[0]);
}
