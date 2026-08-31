// app/api/project-managers/[id]/current-tenders/route.ts
//
// Tenders currently resolving to this PM — feeds the admin reassignment
// modal's "specific tenders" picker. Starts from tenders whose frozen
// project_manager_id points here, then filters out any that a prior
// reassignment has already routed elsewhere, so the picker only shows
// tenders that would actually be affected by a new reassignment against
// this PM. Gated the same as the reassign action itself, since this only
// feeds that admin flow.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { canManageProjectManagers } from "@/lib/permissions";
import { resolveCurrentProjectManager } from "@/lib/projectManagerReassignment";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const pmId = Number(id);
  if (!Number.isInteger(pmId) || pmId <= 0) {
    return NextResponse.json({ error: "Invalid project manager id" }, { status: 400 });
  }

  const userRoleIds = (session.user as any).roleIds || [];
  if (!(await canManageProjectManagers(session.user.id, userRoleIds))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tendersRes = await query(
    `SELECT tender_id, tender_name, stage, closing_date, handover_date
     FROM tender WHERE project_manager_id = $1 AND is_deleted = false ORDER BY tender_name`,
    [pmId]
  );

  const current: typeof tendersRes.rows = [];
  for (const row of tendersRes.rows) {
    const resolved = await resolveCurrentProjectManager(pmId, row.tender_id);
    const currentPmId = resolved ? resolved.id : pmId;
    if (currentPmId === pmId) {
      current.push(row);
    }
  }

  return NextResponse.json(current);
}
