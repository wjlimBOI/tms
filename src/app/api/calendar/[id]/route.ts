// app/api/calendar/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logUpdate, logDelete, logAuthEvent } from "@/lib/audit";
import { sanitize } from "@/lib/sanitize";

// PUT – update an event (only admin or creator)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { start_date, end_date, all_day, event_type, brand_id, tender_id } = body;
  const title = sanitize(body.title || "");
  const location = body.location ? sanitize(body.location) : body.location;
  const description = body.description ? sanitize(body.description) : body.description;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // 1. Fetch old event data for audit
  const oldResult = await query(
    `SELECT event_id, title, start_date, end_date, all_day, event_type, location, description, brand_id, tender_id, created_by
     FROM calendar_events
     WHERE event_id = $1 AND is_deleted = false`,
    [id]
  );
  if (oldResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const oldEvent = oldResult.rows[0];

  // Check permission: admin (role_id=1) or creator
  const isAdmin = await query(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = 1`, [session.user.id]);
  const isCreator = oldEvent.created_by === session.user.id;
  const canEdit = isCreator || (isAdmin.rows.length > 0);

  if (!canEdit) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "update_calendar_event",
      reason: "User is not admin or creator",
      source: "api"
    });
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    // Perform update
    const updateResult = await query(
      `UPDATE calendar_events 
       SET title = $1,
           start_date = $2,
           end_date = $3,
           all_day = $4,
           event_type = $5,
           location = $6,
           description = $7,
           brand_id = $8,
           tender_id = $9,
           updated_at = NOW()
       WHERE event_id = $10
       RETURNING *`,
      [
        title,
        start_date,
        end_date || null,
        all_day ?? true,
        event_type || 'milestone',
        location || null,
        description || null,
        brand_id || null,
        tender_id || null,
        id,
      ]
    );

    if (updateResult.rowCount === 0) {
      return NextResponse.json({ error: "Event not found or permission denied" }, { status: 404 });
    }

    const newEvent = updateResult.rows[0];

    // Audit log
    await logUpdate(
      "calendar_events",
      parseInt(id),
      oldEvent,
      newEvent,
      session.user.id,
      req,
      {
        action: "update_calendar_event",
        source: "api"
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating calendar event:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE – remove an event (only admin or creator)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 1. Fetch old event for audit
  const oldResult = await query(
    `SELECT event_id, title, start_date, end_date, all_day, event_type, location, description, brand_id, tender_id, created_by
     FROM calendar_events
     WHERE event_id = $1 AND is_deleted = false`,
    [id]
  );
  if (oldResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const oldEvent = oldResult.rows[0];

  // Check permission
  const isAdmin = await query(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = 1`, [session.user.id]);
  const isCreator = oldEvent.created_by === session.user.id;
  const canDelete = isCreator || (isAdmin.rows.length > 0);

  if (!canDelete) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "delete_calendar_event",
      reason: "User is not admin or creator",
      source: "api"
    });
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    // Soft delete (or hard? we'll soft delete to preserve audit)
    const result = await query(
      `UPDATE calendar_events SET is_deleted = true, deleted_at = NOW()
       WHERE event_id = $1
       RETURNING event_id`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Event not found or permission denied" }, { status: 404 });
    }

    // Audit log
    await logDelete(
      "calendar_events",
      parseInt(id),
      oldEvent,
      session.user.id,
      req,
      {
        action: "delete_calendar_event",
        title: oldEvent.title,
        source: "api"
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}