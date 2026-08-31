// app/api/tenders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { tenderUpdateSchema, validateBody, tenderIdParamSchema } from "@/lib/validation";
import { canViewTenderWithParticipation, canViewDraftTender, hasContractorParticipated } from "@/lib/permissions";
import { logUpdate, logDelete, logAuthEvent } from "@/lib/audit";
import { syncTenderToCalendar } from "@/lib/syncTenderToCalendar";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS, isSuperUser } from "@/lib/roles";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { z } from "zod";

// ---------- OPTIONS (CORS preflight) ----------
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- GET – fetch a single tender with visibility rules ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  // Validate and parse tender ID
  const { id } = await params;
  const idResult = tenderIdParamSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid tender ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const tenderId = idResult.data.id;

  await applyScheduledTenderTransitions();

  // Check existence and status
  const basicResult = await query(
    `SELECT t.*, ts.status_code
     FROM tender t
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );
  if (basicResult.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: corsHeaders });
  }
  const tender = basicResult.rows[0];
  const userRoleIds = (session.user as any).roleIds || [];
  const userId = (session.user as any).id;

  // Draft visibility
  const canViewDraft = await canViewDraftTender(userId, userRoleIds);
  if (tender.status_code === 'draft' && !canViewDraft) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  // Participation check
  const allowed = await canViewTenderWithParticipation(tenderId, userId, userRoleIds);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  // Full data – including tender's own project manager fields
  // Removed b.address and replaced with address fields from branch_address
  // Fixed pm table reference to project_managers
  const fullResult = await query(
    `SELECT t.*,
            b.branch_name,
            b.brand_id,
            br.brand_name,
            rt.type_name AS renovation_type,
            ts.status_code,
            ts.label AS status_label,
            -- Address fields from branch_address
            ba.address_id,
            ba.full_address AS branch_full_address,
            ba.building_name AS branch_building_name,
            ba.postal_code AS branch_postal_code,
            ba.city AS branch_city,
            ba.country AS branch_country,
            ba.is_primary AS branch_address_is_primary,
            pm.id AS project_manager_id,
            pm.name AS project_manager_name_joined,
            pm.email AS project_manager_email_joined,
            pm.phone AS project_manager_phone_joined,
            t.project_manager_name,
            t.project_manager_email,
            t.project_manager_phone,
            hu.username AS handover_by_name,
            ta.award_id,
            ta.winning_contractor_id,
            ta.contract_value,
            ta.awarded_date,
            ta.contract_received_at,
            ta.contract_received_by,
            wc.username AS winning_contractor_name,
            rcb.username AS contract_received_by_name
     FROM tender t
     JOIN branch b ON t.branch_id = b.branch_id
     LEFT JOIN branch_address ba ON b.branch_id = ba.branch_id AND ba.is_primary = true
     JOIN brand br ON b.brand_id = br.brand_id
     JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
     JOIN tender_status ts ON t.status_id = ts.status_id
     LEFT JOIN project_managers pm ON t.project_manager_id = pm.id
     LEFT JOIN users hu ON hu.user_id = t.handover_by
     LEFT JOIN tender_award ta ON ta.tender_id = t.tender_id
     LEFT JOIN users wc ON wc.user_id = ta.winning_contractor_id
     LEFT JOIN users rcb ON rcb.user_id = ta.contract_received_by
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );

  const briefingRes = await query(
    `SELECT id, briefing_date, description
     FROM tender_briefing_dates
     WHERE tender_id = $1
     ORDER BY briefing_date ASC`,
    [tenderId]
  );

  const tenderData: Record<string, any> = { ...fullResult.rows[0] };

  // A Contractor may be viewing this because it's still Open (any
  // contractor can see an Open tender per canViewTenderWithParticipation),
  // not because they actually participate in it — matches the "simple
  // details" redaction the tenders list endpoint already applies for the
  // same case, so a non-participant can't get the fuller field set just by
  // hitting the detail endpoint directly instead of the list.
  if (userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    const participated = await hasContractorParticipated(tenderId, userId);
    if (!participated) {
      tenderData.tender_description = null;
      tenderData.project_manager_email = null;
      tenderData.project_manager_name = null;
      tenderData.project_manager_phone = null;
      tenderData.project_manager_email_joined = null;
      tenderData.project_manager_name_joined = null;
      tenderData.project_manager_phone_joined = null;
      tenderData.expected_handover_date = null;
      tenderData.handover_date = null;
      tenderData.defect_liability_months = null;
    }

    // Contract/award administrative details are staff-only (Admin/Developer/
    // PM/Senior PM — see canMarkContractReceived in tenders/[id]/page.tsx) —
    // no contractor, winning or otherwise, should receive them from the API,
    // even though the UI never renders this section for a contractor.
    tenderData.contract_value = null;
    tenderData.contract_received_at = null;
    tenderData.contract_received_by = null;
    tenderData.contract_received_by_name = null;
  }

  return NextResponse.json(
    { ...tenderData, briefing_dates: briefingRes.rows },
    { headers: corsHeaders }
  );
}

// Fields the admin tender-edit page treats as "metadata" (branch, dates, PM,
// etc.) — gated to Admins only. Everything else in tenderUpdateSchema is
// "content" (clauses) — gated to Admins or Legal Team. Kept in sync with the
// `metadataFields` list in src/app/admin/tenders/[id]/page.tsx.
const TENDER_METADATA_FIELDS = [
  'tender_name', 'tender_description', 'status_id', 'branch_id', 'renovation_type_id',
  'project_manager_id', 'project_manager_name', 'project_manager_email', 'project_manager_phone',
  'tender_date', 'closing_date', 'renovation_start_date', 'renovation_end_date',
  'expected_handover_date', 'defect_liability_months',
  'briefing_dates',
];

// ---------- PUT – update a tender (admin: metadata + content; legal: content only) ----------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const userRoleIds = ((session.user as any).roleIds as number[]) || [];
  const isAdmin = isSuperUser(userRoleIds);
  const isLegal = userRoleIds.includes(ROLE_IDS.LEGAL_TEAM);
  if (!isAdmin && !isLegal) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, request, "Non-authorized user attempted to update tender");
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  // Validate and parse tender ID
  const { id } = await params;
  const idResult = tenderIdParamSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid tender ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const tenderId = idResult.data.id;

  // Peek at the raw body (before Zod defaults fill anything in) to know:
  // (a) whether the client actually intended to touch briefing_dates —
  //     tenderUpdateSchema defaults it to [] when the key is absent, which
  //     would otherwise be indistinguishable from "clear all briefing dates".
  // (b) whether this request touches any metadata field — non-admins (Legal)
  //     may only ever submit content (clauses).
  let briefingDatesProvided = false;
  let touchesMetadata = false;
  try {
    const rawBody = await request.clone().json();
    briefingDatesProvided = Object.prototype.hasOwnProperty.call(rawBody, 'briefing_dates');
    touchesMetadata = TENDER_METADATA_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(rawBody, field)
    );
  } catch {
    // ignore - validateBody below will surface the JSON parse error properly
  }

  if (touchesMetadata && !isAdmin) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, request, "Non-admin attempted to edit tender metadata");
    return NextResponse.json({ error: "Only admins can edit tender metadata" }, { status: 403, headers: corsHeaders });
  }

  // Validate request body (this includes sanitisation)
  const validation = await validateBody(request, tenderUpdateSchema);
  if (!validation.success) {
    // Attach CORS headers to the validation error response
    const response = validation.response;
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
  const updates = validation.data;

  // Helper to convert strings to ISO datetime or null
  const toIsoOrNull = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value !== 'string') return null;
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  };

  // Prepare a clean update object with converted date fields
  const updateData: Record<string, any> = {};
  const datetimeFields = [
    'tender_date', 'closing_date', 'renovation_start_date', 'renovation_end_date',
    'download_start', 'download_end', 'briefing_date',
    'submission_start', 'submission_end',
    'technical_opening_time', 'commercial_opening_time'
  ];

  // briefing_dates lives in a separate table (tender_briefing_dates), not a
  // column on tender — handle it separately from the generic column loop below.
  const briefingDates = briefingDatesProvided ? updates.briefing_dates : undefined;

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === 'briefing_dates') continue;
    if (datetimeFields.includes(key)) {
      updateData[key] = toIsoOrNull(value);
    } else {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0 && briefingDates === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
  }

  // Fetch old data for audit
  const oldDataRes = await query(`SELECT * FROM tender WHERE tender_id = $1`, [tenderId]);
  if (oldDataRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: corsHeaders });
  }
  const oldData = oldDataRes.rows[0];

  // Build dynamic UPDATE query
  const setClauses: string[] = [];
  const values: any[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(updateData)) {
    setClauses.push(`${key} = $${idx++}`);
    values.push(value);
  }
  setClauses.push(`updated_at = NOW()`);
  values.push(tenderId);

  await query(`UPDATE tender SET ${setClauses.join(", ")} WHERE tender_id = $${idx}`, values);

  // briefing_dates: replace the full set for this tender when provided.
  if (briefingDates !== undefined) {
    await query(`DELETE FROM tender_briefing_dates WHERE tender_id = $1`, [tenderId]);

    if (briefingDates.length > 0) {
      const briefingValues: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;
      for (const briefing of briefingDates) {
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
  }

  const newDataRes = await query(`SELECT * FROM tender WHERE tender_id = $1`, [tenderId]);
  const newData = newDataRes.rows[0];

  // Sync calendar (if any relevant date fields changed)
  try {
    const branchRes = await query(`SELECT brand_id FROM branch WHERE branch_id = $1`, [newData.branch_id]);
    const brand_id = branchRes.rows.length > 0 ? branchRes.rows[0].brand_id : null;
    await syncTenderToCalendar({
      tender_id: tenderId,
      tender_name: newData.tender_name,
      brand_id: brand_id,
      branch_id: newData.branch_id,
      created_by: newData.created_by,
      tender_date: newData.tender_date,
      closing_date: newData.closing_date,
      renovation_start_date: newData.renovation_start_date,
      renovation_end_date: newData.renovation_end_date,
      download_start: newData.download_start,
      download_end: newData.download_end,
      briefing_date: newData.briefing_date,
      submission_start: newData.submission_start,
      submission_end: newData.submission_end,
    });
  } catch (syncError) {
    console.error("Failed to sync tender to calendar after update:", syncError);
  }

  // ✅ Enhanced audit log with extraDetails
  await logUpdate(
    "tender",
    tenderId,
    oldData,
    newData,
    session.user.id,
    request,
    { action: "update_tender", changed_fields: Object.keys(updateData), source: "api" }
  );

  return NextResponse.json({ success: true, data: newData }, { headers: corsHeaders });
}

// ---------- DELETE – soft delete a tender (admin only) ----------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const userRoleIds = ((session.user as any).roleIds as number[]) || [];
  if (!isSuperUser(userRoleIds)) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, request, "Non-admin attempted to delete tender");
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  // Validate and parse tender ID
  const { id } = await params;
  const idResult = tenderIdParamSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid tender ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const tenderId = idResult.data.id;

  const oldDataRes = await query(`SELECT * FROM tender WHERE tender_id = $1`, [tenderId]);
  if (oldDataRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: corsHeaders });
  }
  const oldData = oldDataRes.rows[0];

  await query(`UPDATE tender SET is_deleted = true, deleted_at = NOW() WHERE tender_id = $1`, [tenderId]);

  // ✅ Enhanced audit log with extraDetails
  await logDelete(
    "tender",
    tenderId,
    oldData,
    session.user.id,
    request,
    { action: "delete_tender", tender_name: oldData.tender_name, source: "api" }
  );

  return NextResponse.json({ success: true }, { headers: corsHeaders });
}