// app/api/calendar/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitizeObject } from "@/lib/sanitize";
import { 
  calendarEventCreateSchema, 
  CalendarEventCreateInput 
} from "@/lib/validation";
import { logInsert, logAuthEvent } from "@/lib/audit";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// GET – fetch calendar events with date range
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing start/end parameters" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Build date range (assuming start/end are in YYYY-MM-DD format)
    const startDate = new Date(start + "T00:00:00.000Z");
    const endDate = new Date(end + "T23:59:59.999Z");

    // Fetch events using Prisma
    const events = await prisma.calendar_events.findMany({
      where: {
        is_deleted: false,
        start_date: { lte: endDate },
        end_date: { gte: startDate },
      },
      include: {
        brand: { select: { brand_name: true } },
        tender: { select: { tender_name: true } },
        users: { select: { username: true } },
      },
      orderBy: { start_date: 'asc' },
    });

    // Format the response to match frontend expectations
    const formattedEvents = events.map((e) => ({
      event_id: e.event_id,
      title: e.title,
      description: e.description,
      start_date: e.start_date.toISOString(),
      end_date: e.end_date?.toISOString() || null,
      all_day: e.all_day,
      event_type: e.event_type,
      location: e.location,
      color: e.color,
      brand_id: e.brand_id,
      brand_name: e.brand?.brand_name || null,
      branch_id: e.branch_id,
      tender_id: e.tender_id,
      tender_name: e.tender?.tender_name || null,
      created_by: e.created_by,
      created_by_name: e.users?.username || null,
    }));

    return NextResponse.json(formattedEvents, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST – create a new calendar event
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const validationResult = calendarEventCreateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400, headers: corsHeaders }
      );
    }

    const sanitisedData = sanitizeObject(validationResult.data) as CalendarEventCreateInput;

    const result = await prisma.calendar_events.create({
      data: {
        title: sanitisedData.title,
        start_date: new Date(sanitisedData.start_date),
        end_date: sanitisedData.end_date ? new Date(sanitisedData.end_date) : null,
        all_day: sanitisedData.all_day ?? true,
        event_type: sanitisedData.event_type || 'milestone',
        location: sanitisedData.location || null,
        description: sanitisedData.description || null,
        brand_id: sanitisedData.brand_id || null,
        branch_id: sanitisedData.branch_id || null,
        tender_id: sanitisedData.tender_id || null,
        created_by: session.user.id,
      },
    });

    await logInsert(
      "calendar_events",
      result.event_id,
      result,
      session.user.id,
      request,
      {
        action: "create_calendar_event",
        title: result.title,
        start_date: result.start_date.toISOString(),
        source: "api"
      }
    );

    return NextResponse.json(
      { event_id: result.event_id, message: "Event created" },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}