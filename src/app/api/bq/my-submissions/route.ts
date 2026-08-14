// src/app/api/bq/my-submissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";
import { ROLE_IDS, isSuperViewer } from "@/lib/roles";

// ============================================================
// FIXED: query schema handles null, undefined, and empty strings
// ============================================================
const querySchema = z.object({
  page: z.preprocess(
    (val) => (val === null || val === undefined || val === '' ? 1 : Number(val)),
    z.number().int().positive()
  ),
  limit: z.preprocess(
    (val) => (val === null || val === undefined || val === '' ? 12 : Number(val)),
    z.number().int().positive().max(100)
  ),
  client: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().optional()
  ),
  jobSite: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().optional()
  ),
  workType: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().optional()
  ),
  status: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().optional()
  ),
  fromDate: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().date().optional()
  ),
  toDate: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().date().optional()
  ),
});

async function getUserRoleIds(userId: number): Promise<number[]> {
  const userRoles = await prisma.user_roles.findMany({
    where: { user_id: userId },
    select: { role_id: true },
  });
  return userRoles.map(ur => ur.role_id);
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const userId = session.user.id;
  const roleIds = await getUserRoleIds(userId);
  const isContractor = roleIds.includes(ROLE_IDS.CONTRACTOR);
  const isAdmin = isSuperViewer(roleIds);

  // Parse and validate query params
  const searchParams = request.nextUrl.searchParams;
  const queryResult = querySchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    client: searchParams.get('client'),
    jobSite: searchParams.get('jobSite'),
    workType: searchParams.get('workType'),
    status: searchParams.get('status'),
    fromDate: searchParams.get('fromDate'),
    toDate: searchParams.get('toDate'),
  });
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { page, limit, client, jobSite, workType, status, fromDate, toDate } = queryResult.data;

  // Base SQL – using raw SQL to preserve complex joins
  let baseSql = `
    SELECT
        ts.submission_id,
        ts.tender_id,
        ts.round_no,
        ts.version_name,
        ts.status,
        ts.updated_at,
        ts.created_at,
        ts.bq_date,
        ts.area_size,
        ts.client_name_override,
        ts.branch_name_override,
        ts.contractor_id,
        ts.bq_name,
        COALESCE(ts.client_name_override, br.brand_name) AS client_name,
        COALESCE(ts.branch_name_override, b.branch_name) AS job_site,
        COALESCE(
          (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
          rt.type_name
        ) AS work_type,
        tstat.status_code AS tender_status_code,
        (SELECT MAX(round_no) FROM tender_submission
         WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false) AS max_round
     FROM tender_submission ts
     JOIN tender t ON ts.tender_id = t.tender_id
     JOIN branch b ON t.branch_id = b.branch_id
     JOIN brand br ON b.brand_id = br.brand_id
     JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
     JOIN tender_status tstat ON tstat.status_id = t.status_id
     WHERE ts.is_deleted = false
       AND ts.status IN ('Draft', 'Submitted')
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  // Permission filter
  if (isContractor) {
    conditions.push(`ts.contractor_id = $${params.length + 1}`);
    params.push(userId);
  }

  // Apply filters (sanitised)
  if (client) {
    conditions.push(`COALESCE(ts.client_name_override, br.brand_name) ILIKE $${params.length + 1}`);
    params.push(`%${sanitize(client)}%`);
  }
  if (jobSite) {
    conditions.push(`COALESCE(ts.branch_name_override, b.branch_name) ILIKE $${params.length + 1}`);
    params.push(`%${sanitize(jobSite)}%`);
  }
  if (workType) {
    conditions.push(
      `COALESCE((SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override), rt.type_name) ILIKE $${params.length + 1}`
    );
    params.push(`%${sanitize(workType)}%`);
  }
  if (status) {
    conditions.push(`ts.status = $${params.length + 1}`);
    params.push(sanitize(status));
  }
  if (fromDate) {
    conditions.push(`ts.bq_date >= $${params.length + 1}`);
    params.push(fromDate); // already validated as date
  }
  if (toDate) {
    conditions.push(`ts.bq_date <= $${params.length + 1}`);
    params.push(toDate);
  }

  if (conditions.length > 0) {
    baseSql += " AND " + conditions.join(" AND ");
  }

  // Count total
  const countSql = `SELECT COUNT(*) as total FROM (${baseSql}) as subquery`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...params) as { total: string }[];
  const total = parseInt(countResult[0]?.total || '0');

  // Paginated data
  const dataSql = `${baseSql} ORDER BY ts.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const dataParams = [...params, limit, (page - 1) * limit];
  const dataRows = await prisma.$queryRawUnsafe(dataSql, ...dataParams) as any[];

  // Every resubmission_request for this contractor across the tenders in
  // this page of results — one lookup, reused for two purposes (2026-08-10):
  // (a) the "unfulfilled" flag drives the list badge (next_round_no not yet
  //     reached by any of this contractor's rounds on that tender), (b) the
  //     exact-round match feeds can_edit below, matching the same
  //     tender-status-or-active-grant rule as canEditSubmission
  //     (src/lib/permissions.ts) and GET /api/bq/[submissionId].
  let requestsByTender = new Map<number, { instructions: string | null; due_by: string | null; next_round_no: number }[]>();
  if (isContractor && dataRows.length > 0) {
    const tenderIds = Array.from(new Set(dataRows.map((r: any) => r.tender_id)));
    const rrRows = await prisma.$queryRawUnsafe(
      `SELECT tender_id, instructions, due_by, next_round_no
       FROM resubmission_request
       WHERE contractor_id = $1 AND tender_id = ANY($2::int[])
       ORDER BY created_at DESC`,
      userId,
      tenderIds
    ) as { tender_id: number; instructions: string | null; due_by: string | null; next_round_no: number }[];
    rrRows.forEach((r) => {
      const list = requestsByTender.get(r.tender_id) || [];
      list.push(r);
      requestsByTender.set(r.tender_id, list);
    });
  }

  // Enrich with can_edit / can_compare (simplified)
  const enriched = dataRows.map((row: any) => {
    const requests = requestsByTender.get(row.tender_id) || [];
    const unfulfilled = requests.find((r) => r.next_round_no > row.max_round) || null;
    const grantsThisRound = requests.some((r) => r.next_round_no === row.round_no);

    let canEdit = false;
    if (isAdmin) {
      canEdit = true;
    } else if (isContractor && row.contractor_id === userId) {
      const isDraft = row.status === "Draft";
      const isLatest = row.round_no === row.max_round;
      const tenderStillOpen = row.tender_status_code === "Open";
      canEdit = isDraft && isLatest && (tenderStillOpen || grantsThisRound);
    }
    // For comparison: allow admins and procurement managers (adjust as needed)
    const canCompare = isAdmin || roleIds.some(id => [2, 3, 4].includes(id)); // e.g., procurement, finance, reviewer
    return { ...row, can_edit: canEdit, can_compare: canCompare, resubmission_requested: !!unfulfilled, resubmission_instructions: unfulfilled?.instructions ?? null, resubmission_due_by: unfulfilled?.due_by ?? null };
  });

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json(
    {
      data: enriched,
      total,
      page,
      totalPages,
    },
    { headers: corsHeaders }
  );
}