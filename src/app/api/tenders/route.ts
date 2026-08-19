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
import { ROLE_IDS, isSuperUser } from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { createApprovalRequestIfConfigured } from "@/lib/approvals";

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

  await applyScheduledTenderTransitions();

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
  const userRoleIds = (session.user as any)?.roleIds || [];

  const userId = (session.user as any)?.id;
  const isContractor = userRoleIds.includes(ROLE_IDS.CONTRACTOR);

  // Broader than has_expressed_interest — matches the participation
  // definition canAccessTenderDocuments/canAccessTenderMessages/
  // canViewTenderWithParticipation already use (interest OR submission OR
  // tender_contractor OR being the awarded contractor), so a contractor who
  // e.g. submitted a BQ without a separate "Register Interest" click still
  // sees full details and doesn't lose a Closed/Awarded tender from their list.
  const participationSubquery = `
      SELECT 1 FROM tender_submission tsub WHERE tsub.tender_id = t.tender_id AND tsub.contractor_id = $1 AND tsub.is_deleted = false
      UNION SELECT 1 FROM tender_interest tint WHERE tint.tender_id = t.tender_id AND tint.contractor_id = $1
      UNION SELECT 1 FROM tender_contractor tcon WHERE tcon.tender_id = t.tender_id AND tcon.contractor_id = $1
      UNION SELECT 1 FROM tender_award taw WHERE taw.tender_id = t.tender_id AND taw.winning_contractor_id = $1
  `;

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
      ts.status_code,
      t.project_manager_email,
      t.expected_handover_date,
      t.handover_date,
      t.defect_liability_months,
      (SELECT COUNT(*) FROM tender_interest ti WHERE ti.tender_id = t.tender_id)::int AS interest_count
      ${isContractor ? `,
      EXISTS(SELECT 1 FROM tender_interest ti2 WHERE ti2.tender_id = t.tender_id AND ti2.contractor_id = $1) AS has_expressed_interest,
      EXISTS(${participationSubquery}) AS has_participated
      ` : ""}
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

  if (isContractor) {
    params.push(userId);
    idx = 2;
    // Open tenders are visible to every contractor (reduced fields applied
    // below if they haven't participated). Closed/Awarded tenders only
    // remain visible to contractors who actually participated — a
    // non-participant loses visibility the moment a tender leaves Open,
    // matching canViewTenderWithParticipation's detail-page gate.
    sql += ` AND (ts.status_code = 'Open' OR (ts.status_code IN ('closed', 'awarded') AND EXISTS(${participationSubquery})))`;
  }

  if (statusCode) {
    sql += ` AND ts.status_code = $${idx++}`;
    params.push(statusCode);
  }
  if (search) {
    sql += ` AND (t.tender_name ILIKE $${idx++} OR t.tender_description ILIKE $${idx++})`;
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY t.renovation_start_date DESC NULLS LAST, t.tender_id DESC LIMIT $${idx++} OFFSET $${idx++}`;
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
  if (isContractor) {
    countParams.push(userId);
    cIdx = 2;
    countSql += ` AND (ts.status_code = 'Open' OR (ts.status_code IN ('closed', 'awarded') AND EXISTS(${participationSubquery})))`;
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

  // "Simple details" for a contractor who hasn't participated in this
  // (necessarily still-Open) tender: name/dates/branch/brand/status only —
  // no description, PM contact, or handover/DLP operational details.
  const cleanedRows = result.rows.map(({ status_code, ...rest }: any) => {
    if (isContractor && !rest.has_participated) {
      rest.tender_description = null;
      rest.project_manager_email = null;
      rest.expected_handover_date = null;
      rest.handover_date = null;
      rest.defect_liability_months = null;
    }
    return rest;
  });

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

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!isSuperUser(userRoleIds)) {
    const allowed = await hasPermission(session.user.id, userRoleIds, "Tender Management", "create_tender");
    if (!allowed) {
      await logAuthEvent("PERMISSION_DENIED", session.user.id, request, `User ${session.user.id} attempted to create tender without permission`);
      return NextResponse.json({ error: "Forbidden: insufficient permissions to create a tender" }, { status: 403, headers: corsHeaders });
    }
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

  // Get the active contract template — its content becomes this tender's
  // `clauses` snapshot at creation time (see docs on contract_template, F8).
  const templateRes = await query(
    `SELECT template_id, content FROM contract_template WHERE is_active = true ORDER BY version DESC LIMIT 1`
  );
  const activeTemplate = templateRes.rows[0] || null;

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
         contract_template_id, clauses,
         expected_handover_date, defect_liability_months,
         created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
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
        activeTemplate?.template_id || null,
        activeTemplate ? JSON.stringify(activeTemplate.content) : null,
        body.expected_handover_date || null,
        body.defect_liability_months || 12,
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

    // Non-blocking: only creates an approval request if an admin has
    // actually configured a "tender_creation" chain (admin/security >
    // Workflow Config). No chain configured, no-op. Never delays or gates
    // the tender itself — see src/lib/approvals.ts's header comment.
    void createApprovalRequestIfConfigured(
      "tender_creation",
      tenderId,
      (session.user as any).id,
      `New tender "${body.tender_name}"`,
      `/tenders/${tenderId}`
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
      { error: "Failed to create tender" },
      { status: 500, headers: corsHeaders }
    );
  }
}