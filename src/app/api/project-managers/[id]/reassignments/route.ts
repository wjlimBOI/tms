// app/api/project-managers/[id]/reassignments/route.ts
//
// Read-only reassignment history for a project manager, either side (they
// were replaced, or they were the replacement). Unlike the plain PM GET in
// project-managers/route.ts (which only returns name/email/phone — already
// visible in any PM picker), this also exposes internal tender_ids, scope,
// and the changed_by staff member's real name, so it's gated the same as
// the reassign/current-tenders admin actions rather than session-only.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { canManageProjectManagers } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const result = await query(
    `SELECT r.id, r.old_project_manager_id, r.new_project_manager_id, r.scope, r.tender_ids,
            r.effective_from, r.created_at,
            op.name AS old_pm_name, op.email AS old_pm_email,
            np.name AS new_pm_name, np.email AS new_pm_email,
            COALESCE(up.full_name, u.username) AS changed_by_name
     FROM project_manager_reassignment r
     JOIN project_managers op ON op.id = r.old_project_manager_id
     JOIN project_managers np ON np.id = r.new_project_manager_id
     LEFT JOIN users u ON u.user_id = r.changed_by
     LEFT JOIN user_profile up ON up.user_id = u.user_id
     WHERE r.old_project_manager_id = $1 OR r.new_project_manager_id = $1
     ORDER BY r.created_at DESC`,
    [pmId]
  );

  return NextResponse.json(result.rows);
}
