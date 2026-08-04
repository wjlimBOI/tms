// app/api/tenders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { 
  tenderCreateSchema, 
  tenderListQuerySchema, 
  validateBody,
  type TenderCreateInput,
} from "@/lib/validation";
import { logInsert, logAuthEvent } from "@/lib/audit";
import { syncTenderToCalendar } from "@/lib/syncTenderToCalendar";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";

// ---------- OPTIONS (CORS preflight) ----------
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET ----------
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const searchParams = request.nextUrl.searchParams;
  const queryResult = tenderListQuerySchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    status: searchParams.get('status'),
    search: searchParams.get('search'),
  });
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { page, limit, status: statusCode, search } = queryResult.data;

  const offset = (page - 1) * limit;
  const userRole = (session.user as any)?.role_id;

  let sql = `
    SELECT 
      t.tender_id, 
      t.tender_name, 
      t.tender_description,
      b.branch_name, 
      ba.building_name,
      br.brand_name, 
      rt.type_name AS renovation_type,
      ts.label AS status_label,
      t.tender_date, 
      t.renovation_start_date, 
      t.renovation_end_date,
      t.closing_date,
      t.stage,
      ts.status_code
    FROM tender t
    JOIN branch b ON t.branch_id = b.branch_id
    LEFT JOIN branch_address ba ON b.branch_id = ba.branch_id AND ba.is_primary = true
    JOIN brand br ON b.brand_id = br.brand_id
    JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
    JOIN tender_status ts ON t.status_id = ts.status_id
    WHERE t.is_deleted = false
  `;

  const params: any[] = [];
  let idx = 1;

  if (userRole === 13) {
    sql += ` AND ts.status_code = 'Open'`;
  }

  if (statusCode) {
    sql += ` AND ts.status_code = $${idx++}`;
    params.push(statusCode);
  }
  if (search) {
    sql += ` AND (t.tender_name ILIKE $${idx++} OR t.tender_description ILIKE $${idx++})`;
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY t.tender_id DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  let countSql = `
    SELECT COUNT(*)
    FROM tender t
    JOIN tender_status ts ON t.status_id = ts.status_id
    WHERE t.is_deleted = false
  `;
  const countParams: any[] = [];
  let cIdx = 1;
  if (userRole === 13) {
    countSql += ` AND ts.status_code = 'Open'`;
  }
  if (statusCode) {
    countSql += ` AND ts.status_code = $${cIdx++}`;
    countParams.push(statusCode);
  }
  if (search) {
    countSql += ` AND (t.tender_name ILIKE $${cIdx++} OR t.tender_description ILIKE $${cIdx++})`;
    countParams.push(`%${search}%`, `%${search}%`);
  }
  const countRes = await query(countSql, countParams);
  const total = parseInt(countRes.rows[0].count);

  const cleanedRows = result.rows.map(({ status_code, ...rest }) => rest);

  return NextResponse.json(
    { data: cleanedRows, total, page, limit },
    { headers: corsHeaders }
  );
}

// ---------- POST ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const userRole = (session.user as any)?.role_id;
  if (userRole !== 1) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, request, `User ${session.user.id} attempted to create tender without admin role`);
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403, headers: corsHeaders });
  }

  const validation = await validateBody(request, tenderCreateSchema);
  if (!validation.success) {
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
  const body: TenderCreateInput = validation.data;

  // Get 'Upcoming' status ID
  const statusRes = await query(
    `SELECT status_id FROM tender_status WHERE status_code = $1`,
    ['Upcoming']
  );
  if (statusRes.rows.length === 0) {
    return NextResponse.json(
      { error: "Upcoming tender status not found in database" },
      { status: 500, headers: corsHeaders }
    );
  }
  const statusId = statusRes.rows[0].status_id;

  // Start transaction
  const client = await query('BEGIN');

  try {
    // Insert tender
    const result = await query(
      `INSERT INTO tender (
         branch_id, renovation_type_id, status_id, created_by,
         tender_name, tender_description, tender_date, closing_date,
         renovation_start_date, renovation_end_date, estimated_budget,
         project_manager_id, project_manager_name, project_manager_email, project_manager_phone,
         created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
       RETURNING tender_id`,
      [
        body.branch_id,
        body.renovation_type_id,
        statusId,
        (session.user as any).id,
        body.tender_name,
        body.tender_description,
        body.tender_date || null,
        body.closing_date || null,
        body.renovation_start_date || null,
        body.renovation_end_date || null,
        body.estimated_budget || null,
        body.project_manager_id || null,
        body.project_manager_name || null,
        body.project_manager_email || null,
        body.project_manager_phone || null,
      ]
    );

    const tenderId = result.rows[0].tender_id;

    // Insert briefing dates if provided
    if (body.briefing_dates && body.briefing_dates.length > 0) {
      const briefingValues: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const briefing of body.briefing_dates) {
        briefingValues.push(tenderId, briefing.date, briefing.description || null);
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
        paramIndex += 3;
      }

      await query(
        `INSERT INTO tender_briefing_dates (tender_id, briefing_date, description)
         VALUES ${placeholders.join(', ')}`,
        briefingValues
      );
    }

    // Commit transaction
    await query('COMMIT');

    // Sync calendar with first briefing date if available
    try {
      const branch_id = body.branch_id;
      const branchRes = await query(`SELECT brand_id FROM branch WHERE branch_id = $1`, [branch_id]);
      const brand_id = branchRes.rows.length > 0 ? branchRes.rows[0].brand_id : null;

      // Use first briefing date if available, otherwise null
      const briefingDate = body.briefing_dates && body.briefing_dates.length > 0 
        ? body.briefing_dates[0].date 
        : null;

      await syncTenderToCalendar({
        tender_id: tenderId,
        tender_name: body.tender_name,
        brand_id: brand_id,
        branch_id: branch_id,
        created_by: (session.user as any).id,
        tender_date: body.tender_date,
        closing_date: body.closing_date,
        renovation_start_date: body.renovation_start_date,
        renovation_end_date: body.renovation_end_date,
        briefing_date: briefingDate,
        submission_start: null,
        submission_end: null,
        download_start: null,
        download_end: null,
      });
    } catch (syncError) {
      console.error("Failed to sync tender to calendar:", syncError);
    }

    // Audit log
    await logInsert(
      "tender",
      tenderId,
      body,
      (session.user as any).id,
      request,
      { 
        action: "create_tender", 
        tender_name: body.tender_name, 
        briefing_count: body.briefing_dates?.length || 0,
        source: "api" 
      }
    );

    return NextResponse.json(
      { tender_id: tenderId },
      { status: 201, headers: corsHeaders }
    );

  } catch (error) {
    // Rollback on error
    await query('ROLLBACK');
    console.error("Error creating tender:", error);
    
    return NextResponse.json(
      { error: "Failed to create tender", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: corsHeaders }
    );
  }
}