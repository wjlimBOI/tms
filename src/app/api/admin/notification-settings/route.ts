// app/api/admin/notification-settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { isSuperUser } from "@/lib/roles";

// GET: fetch all notification event types and their email on/off state
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
      `SELECT event_type, label, email_enabled FROM notification_event_settings ORDER BY event_type`
    );
    return NextResponse.json({ settings: result.rows });
  } catch (error) {
    console.error("GET /api/admin/notification-settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification settings" },
      { status: 500 }
    );
  }
}

// PUT: toggle a single event type's email_enabled state
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
    const { event_type, email_enabled } = body;

    if (typeof event_type !== "string" || typeof email_enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid input: event_type (string) and email_enabled (boolean) are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `UPDATE notification_event_settings
       SET email_enabled = $1, updated_at = NOW(), updated_by = $2
       WHERE event_type = $3
       RETURNING event_type`,
      [email_enabled, session.user.id, event_type]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Unknown event type" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/notification-settings error:", error);
    return NextResponse.json(
      { error: "Failed to update notification settings" },
      { status: 500 }
    );
  }
}
