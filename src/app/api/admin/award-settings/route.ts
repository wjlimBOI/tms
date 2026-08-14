// app/api/admin/award-settings/route.ts
//
// Mirrors /api/admin/extension-settings exactly, but for `tender_award_settings`
// — which role(s) may run the Award action (Closed -> Awarded). See
// canApproveAward() in src/lib/permissions.ts for why this is deliberately
// not folded into the Admin/Developer isSuperUser bypass.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logInsert, logAuthEvent } from "@/lib/audit";
import { isSuperUser } from "@/lib/roles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = session.user.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(
    `SELECT s.*, r.role_name
     FROM tender_award_settings s
     JOIN roles r ON s.role_id = r.role_id
     ORDER BY r.role_name`
  );

  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = session.user.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "create_award_setting",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { role_id, is_approver } = body;

  if (!role_id || typeof is_approver !== "boolean") {
    return NextResponse.json(
      { error: "Missing role_id or is_approver" },
      { status: 400 }
    );
  }

  try {
    const roleCheck = await query("SELECT role_id FROM roles WHERE role_id = $1", [role_id]);
    if (roleCheck.rows.length === 0) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const existing = await query(
      "SELECT id FROM tender_award_settings WHERE role_id = $1",
      [role_id]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Setting already exists for this role" },
        { status: 409 }
      );
    }

    const result = await query(
      `INSERT INTO tender_award_settings (role_id, is_approver)
       VALUES ($1, $2)
       RETURNING id, role_id, is_approver, created_at, updated_at`,
      [role_id, is_approver]
    );

    const newSetting = result.rows[0];

    await logInsert(
      "tender_award_settings",
      newSetting.id,
      newSetting,
      session.user.id,
      req,
      {
        action: "create_award_setting",
        role_id,
        is_approver,
        source: "admin_api"
      }
    );

    return NextResponse.json(newSetting, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/award-settings error:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    );
  }
}
