// app/api/admin/award-settings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logUpdate, logAuthEvent } from "@/lib/audit";
import { isSuperUser } from "@/lib/roles";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = session.user.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "update_award_setting",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const settingId = parseInt(id, 10);
  if (isNaN(settingId)) {
    return NextResponse.json({ error: "Invalid setting ID" }, { status: 400 });
  }

  const body = await req.json();
  const { is_approver } = body;

  if (typeof is_approver !== "boolean") {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const oldResult = await query(
    `SELECT id, role_id, is_approver, created_at, updated_at
     FROM tender_award_settings
     WHERE id = $1`,
    [settingId]
  );
  if (oldResult.rows.length === 0) {
    return NextResponse.json({ error: "Setting not found" }, { status: 404 });
  }
  const oldData = oldResult.rows[0];

  if (is_approver === oldData.is_approver) {
    return NextResponse.json({ success: true, message: "No changes applied" });
  }

  await query(
    `UPDATE tender_award_settings SET is_approver = $1, updated_at = NOW() WHERE id = $2`,
    [is_approver, settingId]
  );

  const newResult = await query(
    `SELECT id, role_id, is_approver, created_at, updated_at
     FROM tender_award_settings
     WHERE id = $1`,
    [settingId]
  );
  const newData = newResult.rows[0];

  await logUpdate(
    "tender_award_settings",
    settingId,
    oldData,
    newData,
    session.user.id,
    req,
    {
      action: "update_award_setting",
      changed_fields: ["is_approver"],
      source: "admin_api"
    }
  );

  return NextResponse.json({ success: true });
}
