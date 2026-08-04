// app/api/admin/extension-settings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logUpdate, logAuthEvent } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!userRoleIds.includes(1)) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "update_extension_setting",
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
  const { is_approver, is_cc } = body;

  if (is_approver === undefined && is_cc === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // 1. Fetch the existing setting for audit
  const oldResult = await query(
    `SELECT id, role_id, is_approver, is_cc, created_at, updated_at
     FROM tender_extension_settings
     WHERE id = $1`,
    [settingId]
  );
  if (oldResult.rows.length === 0) {
    return NextResponse.json({ error: "Setting not found" }, { status: 404 });
  }
  const oldData = oldResult.rows[0];

  // 2. Build dynamic updates and track changed fields
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;
  const changedFields: string[] = [];

  if (is_approver !== undefined && is_approver !== oldData.is_approver) {
    updates.push(`is_approver = $${idx++}`);
    values.push(is_approver);
    changedFields.push('is_approver');
  }
  if (is_cc !== undefined && is_cc !== oldData.is_cc) {
    updates.push(`is_cc = $${idx++}`);
    values.push(is_cc);
    changedFields.push('is_cc');
  }

  // If nothing actually changed, return early (no audit needed)
  if (changedFields.length === 0) {
    return NextResponse.json({ success: true, message: "No changes applied" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(settingId);

  // 3. Perform the update
  await query(
    `UPDATE tender_extension_settings SET ${updates.join(", ")} WHERE id = $${idx}`,
    values
  );

  // 4. Fetch the updated record for audit
  const newResult = await query(
    `SELECT id, role_id, is_approver, is_cc, created_at, updated_at
     FROM tender_extension_settings
     WHERE id = $1`,
    [settingId]
  );
  const newData = newResult.rows[0];

  // 5. Audit log the update
  await logUpdate(
    "tender_extension_settings",
    settingId,
    oldData,
    newData,
    session.user.id,
    req,
    {
      action: "update_extension_setting",
      changed_fields: changedFields,
      source: "admin_api"
    }
  );

  return NextResponse.json({ success: true });
}