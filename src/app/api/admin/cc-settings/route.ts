// app/api/admin/cc-settings/route.ts
//
// Per-event-type CC recipients — which roles get CC'd on which tender/
// business notification, not one blanket list applied to everything.
// event_type values match notification_event_settings' vocabulary (only
// the tender/business events; login_alert/password_reset intentionally
// have no CC row, since those are single-recipient security emails).
// Resolved into actual recipient emails by src/lib/notifications.ts's
// sendTrackedEmail at send time.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { isSuperUser } from "@/lib/roles";

// GET: fetch every event type's CC role list
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await query(
      `SELECT event_type, role_ids FROM tender_cc_recipients ORDER BY event_type`
    );
    return NextResponse.json({ settings: result.rows });
  } catch (error) {
    console.error("GET /api/admin/cc-settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch CC settings" },
      { status: 500 }
    );
  }
}

// PUT: update one event type's CC role list
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { event_type, role_ids } = body;

    if (typeof event_type !== "string" || !Array.isArray(role_ids)) {
      return NextResponse.json(
        { error: "Invalid input: event_type (string) and role_ids (array) are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `UPDATE tender_cc_recipients SET role_ids = $1, updated_at = NOW() WHERE event_type = $2 RETURNING event_type`,
      [role_ids, event_type]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Unknown event type" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/cc-settings error:", error);
    return NextResponse.json(
      { error: "Failed to update CC settings" },
      { status: 500 }
    );
  }
}
