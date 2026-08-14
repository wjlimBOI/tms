// src/app/api/admin/tenders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { sanitize } from "@/lib/sanitize";
import { ROLE_IDS } from "@/lib/roles";

// Zod schema for query parameters
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.enum(['tender_id', 'tender_name', 'tender_date', 'closing_date', 'status_label', 'brand_name']).default('tender_id'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Helper: check if user is admin
async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: { in: [ROLE_IDS.ADMIN, ROLE_IDS.DEVELOPER] } },
  });
  return !!userRole;
}

// OPTIONS preflight handler
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Authenticate and check admin
  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Validate query parameters
  const searchParams = request.nextUrl.searchParams;
  const queryResult = querySchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    search: searchParams.get('search'),
    status: searchParams.get('status'),
    sortBy: searchParams.get('sortBy'),
    sortOrder: searchParams.get('sortOrder'),
  });
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { page, limit, search, status, sortBy, sortOrder } = queryResult.data;
  const skip = (page - 1) * limit;

  // Build Prisma where clause
  const where: any = { is_deleted: false };
  if (search) {
    const searchTerm = sanitize(search); // sanitise just in case
    where.OR = [
      { tender_name: { contains: searchTerm, mode: 'insensitive' } },
      { tender_description: { contains: searchTerm, mode: 'insensitive' } },
      { branch: { branch_name: { contains: searchTerm, mode: 'insensitive' } } },
      { branch: { brand: { brand_name: { contains: searchTerm, mode: 'insensitive' } } } },
    ];
  }
  if (status) {
    where.tender_status = { status_code: status };
  }

  // Build Prisma orderBy
  const orderBy: any = {};
  switch (sortBy) {
    case 'tender_id':
      orderBy.tender_id = sortOrder;
      break;
    case 'tender_name':
      orderBy.tender_name = sortOrder;
      break;
    case 'tender_date':
      orderBy.tender_date = sortOrder;
      break;
    case 'closing_date':
      orderBy.closing_date = sortOrder;
      break;
    case 'status_label':
      orderBy.tender_status = { label: sortOrder };
      break;
    case 'brand_name':
      orderBy.branch = { brand: { brand_name: sortOrder } };
      break;
    default:
      orderBy.tender_id = sortOrder;
  }

  try {
    // Get total count for pagination
    const total = await prisma.tender.count({ where });

    // Fetch tenders with all needed relations
    const tenders = await prisma.tender.findMany({
      where,
      include: {
        branch: {
          include: { brand: true },
        },
        renovation_type: true,
        tender_status: true,
        users: {
          select: { username: true },
        },
        project_managers: {
          select: { name: true, email: true, phone: true },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    // Map to the expected shape (same as raw SQL)
    const data = tenders.map(t => ({
      tender_id: t.tender_id,
      tender_name: t.tender_name,
      tender_description: t.tender_description,
      status_id: t.status_id,
      status_label: t.tender_status.label,
      status_code: t.tender_status.status_code,
      branch_name: t.branch.branch_name,
      brand_name: t.branch.brand.brand_name,
      renovation_type: t.renovation_type.type_name,
      tender_date: t.tender_date,
      closing_date: t.closing_date,
      renovation_start_date: t.renovation_start_date,
      renovation_end_date: t.renovation_end_date,
      download_start: t.download_start,
      download_end: t.download_end,
      briefing_date: t.briefing_date,
      submission_start: t.submission_start,
      submission_end: t.submission_end,
      estimated_budget: t.estimated_budget,
      project_manager_id: t.project_manager_id,
      project_manager_name: t.project_manager_name,
      project_manager_email: t.project_manager_email,
      project_manager_phone: t.project_manager_phone,
      created_at: t.created_at,
      updated_at: t.updated_at,
      created_by: t.created_by,
      created_by_username: t.users?.username || null,
    }));

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        data,
        total,
        page,
        limit,
        totalPages,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching tenders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}