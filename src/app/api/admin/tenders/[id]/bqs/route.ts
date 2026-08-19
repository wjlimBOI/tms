// src/app/api/admin/tenders/[id]/bqs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

// Zod schema for route parameter
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Helper: check if user is admin (role_id = 1)
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Validate tender ID
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid tender ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const tenderId = idResult.data.id;

  try {
    // Use raw SQL with parameterised query - fixed column names
    const bqs = await prisma.$queryRaw`
      SELECT 
        ts.submission_id,
        ts.round_no,
        ts.version_name,
        ts.status,
        ts.updated_at,
        ts.created_at,
        ts.bq_date,
        ts.area_size,
        ts.bq_name,
        COALESCE(ts.client_name_override, br.brand_name) AS client_name,
        COALESCE(ts.branch_name_override, b.branch_name) AS job_site,
        COALESCE(
          (SELECT type_name FROM renovation_type WHERE type_id = ts.renovation_type_override),
          rt.type_name
        ) AS work_type,
        ts.contractor_id,
        u.username AS contractor_username,
        COALESCE((
          SELECT COUNT(*)::int FROM bq_line_item WHERE submission_id = ts.submission_id
        ), 0) AS line_item_count,
        COALESCE((
          SELECT SUM(total_price) FROM bq_line_item WHERE submission_id = ts.submission_id
        ), 0) AS total_amount
      FROM tender_submission ts
      JOIN tender t ON ts.tender_id = t.tender_id
      JOIN branch b ON t.branch_id = b.branch_id
      JOIN brand br ON b.brand_id = br.brand_id
      JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
      JOIN users u ON ts.contractor_id = u.user_id
      WHERE ts.tender_id = ${tenderId} AND ts.is_deleted = false
      ORDER BY ts.round_no DESC, ts.updated_at DESC
    `;

    return NextResponse.json(bqs, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Error fetching BQs:", error);
    // Return more detailed error for debugging
    return NextResponse.json(
      { 
        error: "Failed to fetch BQs", 
        details: error.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
      },
      { status: 500, headers: corsHeaders }
    );
  }
}