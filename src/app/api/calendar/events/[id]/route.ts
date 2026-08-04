// app/api/calendar/events/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logUpdate, logDelete, logAuthEvent } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = parseInt(id);
  const body = await req.json();
  const { title, start_date, end_date, all_day, event_type, location, description, brand_id, branch_id, tender_id } = body;
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  // 1. Fetch old event for audit
  const oldEvent = await prisma.calendar_events.findUnique({
    where: { event_id: eventId },
  });
  if (!oldEvent) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // 2. Check permission: admin (role_id=1) or creator
  const isAdmin = await prisma.user_roles.findFirst({
    where: { user_id: session.user.id, role_id: 1 },
  });
  const isCreator = oldEvent.created_by === session.user.id;
  const canEdit = isCreator || !!isAdmin;

  if (!canEdit) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "update_calendar_event",
      reason: "User is not admin or creator",
      source: "api"
    });
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  // 3. Perform update
  try {
    const updatedEvent = await prisma.calendar_events.update({
      where: { event_id: eventId },
      data: {
        title,
        start_date: new Date(start_date),
        end_date: end_date ? new Date(end_date) : null,
        all_day,
        event_type,
        location: location || null,
        description: description || null,
        brand_id: brand_id || null,
        branch_id: branch_id || null,
        tender_id: tender_id || null,
        updated_at: new Date(),
      },
    });

    // 4. Audit log
    await logUpdate(
      "calendar_events",
      eventId,
      oldEvent,
      updatedEvent,
      session.user.id,
      req,
      {
        action: "update_calendar_event",
        source: "api"
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = parseInt(id);

  // 1. Fetch old event for audit
  const oldEvent = await prisma.calendar_events.findUnique({
    where: { event_id: eventId },
  });
  if (!oldEvent) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // 2. Check permission
  const isAdmin = await prisma.user_roles.findFirst({
    where: { user_id: session.user.id, role_id: 1 },
  });
  const isCreator = oldEvent.created_by === session.user.id;
  const canDelete = isCreator || !!isAdmin;

  if (!canDelete) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "delete_calendar_event",
      reason: "User is not admin or creator",
      source: "api"
    });
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  // 3. Perform soft delete (using is_deleted flag)
  try {
    const result = await prisma.calendar_events.update({
      where: { event_id: eventId },
      data: { is_deleted: true, deleted_at: new Date() },
    });

    // 4. Audit log
    await logDelete(
      "calendar_events",
      eventId,
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
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}