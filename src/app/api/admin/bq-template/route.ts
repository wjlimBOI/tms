// src/app/api/admin/bq-template/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";

// Zod schema for query parameter
const querySchema = z.object({
  tenderId: z.string().regex(/^\d+$/, "tenderId must be a numeric string"),
});

// Helper: check if user is admin (role_id = 1)
async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: 1 },
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
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  // Validate query parameter
  const searchParams = request.nextUrl.searchParams;
  const tenderIdParam = searchParams.get("tenderId");
  const validation = querySchema.safeParse({ tenderId: tenderIdParam });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid tenderId", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const tenderId = parseInt(validation.data.tenderId, 10);

  // Verify tender exists (optional but recommended)
  const tenderExists = await prisma.tender.findUnique({
    where: { tender_id: tenderId },
    select: { tender_id: true },
  });
  if (!tenderExists) {
    return NextResponse.json(
      { error: "Tender not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  try {
    // Use Prisma ORM with nulls-first ordering (supported in Prisma 4+)
    const items = await prisma.bq_template_items.findMany({
      where: { tender_id: tenderId },
      select: {
        item_id: true,
        tender_id: true,
        category_id: true,
        parent_item_id: true,
        description: true,
        quantity: true,
        unit: true,
        rate: true,
        sort_order: true,
      },
      orderBy: [
        { category_id: 'asc' },
        { parent_item_id: { sort: 'asc', nulls: 'first' } },
        { sort_order: 'asc' },
      ],
    });

    return NextResponse.json(items, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching BQ template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}