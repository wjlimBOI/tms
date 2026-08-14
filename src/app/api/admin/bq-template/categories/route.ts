// src/app/api/admin/bq-template/categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logUpdate, logAuthEvent } from "@/lib/audit"; // ✅ audit import
import { ROLE_IDS } from "@/lib/roles";

// Zod schemas
const querySchema = z.object({
  tenderId: z.string().regex(/^\d+$/, "tenderId must be a numeric string"),
});

const postBodySchema = z.object({
  tenderId: z.number().int().positive(),
  categoryIds: z.array(z.number().int().positive()),
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

// ----------------------------------------------------------------------
// GET – read‑only (no audit needed)
// ----------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

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
    const categories = await prisma.tender_work_category.findMany({
      where: { tender_id: tenderId },
      orderBy: { sort_order: 'asc' },
      select: { category_id: true },
    });
    const categoryIds = categories.map(c => c.category_id);
    return NextResponse.json(categoryIds, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching tender categories:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ----------------------------------------------------------------------
// POST – replace all categories for a tender
// ----------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_tender_categories",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  const validation = postBodySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { tenderId, categoryIds } = validation.data;

  // Verify tender exists
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

  // Verify all category IDs exist
  const existingCategories = await prisma.work_category.findMany({
    where: { category_id: { in: categoryIds } },
    select: { category_id: true },
  });
  const existingCategoryIds = existingCategories.map(c => c.category_id);
  const missing = categoryIds.filter(id => !existingCategoryIds.includes(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Category IDs ${missing.join(', ')} do not exist` },
      { status: 400, headers: corsHeaders }
    );
  }

  // Fetch old categories for audit
  const oldCategories = await prisma.tender_work_category.findMany({
    where: { tender_id: tenderId },
    orderBy: { sort_order: 'asc' },
  });

  try {
    // Replace categories in transaction
    const newCategories = await prisma.$transaction(async (tx) => {
      await tx.tender_work_category.deleteMany({
        where: { tender_id: tenderId },
      });

      for (let i = 0; i < categoryIds.length; i++) {
        await tx.tender_work_category.create({
          data: {
            tender_id: tenderId,
            category_id: categoryIds[i],
            sort_order: i,
          },
        });
      }

      // Return the new list
      return await tx.tender_work_category.findMany({
        where: { tender_id: tenderId },
        orderBy: { sort_order: 'asc' },
      });
    });

    // ✅ Audit log
    await logUpdate(
      "tender_work_category",
      tenderId,
      oldCategories,
      newCategories,
      session.user.id,
      request,
      {
        action: "update_tender_categories",
        tender_id: tenderId,
        old_count: oldCategories.length,
        new_count: newCategories.length,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true, message: "Categories updated successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error updating tender categories:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}