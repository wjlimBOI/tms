// src/app/api/admin/bq-template/clear/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logDelete, logAuthEvent } from "@/lib/audit"; // ✅ audit import

// Zod schema for query parameter
const querySchema = z.object({
  tenderId: z.string().regex(/^\d+$/, "tenderId must be a numeric string"),
});

// Helper: check if user is admin
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

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "clear_bq_template",
      reason: "Unauthorized",
      source: "admin_api"
    });
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

  // Check if tender exists
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

  // Fetch old data for audit (before deletion)
  const oldItems = await prisma.bq_template_items.findMany({
    where: { tender_id: tenderId },
  });
  const oldCategories = await prisma.tender_work_category.findMany({
    where: { tender_id: tenderId },
  });

  try {
    // Use transaction to delete both template items and category assignments
    await prisma.$transaction(async (tx) => {
      await tx.bq_template_items.deleteMany({
        where: { tender_id: tenderId },
      });
      await tx.tender_work_category.deleteMany({
        where: { tender_id: tenderId },
      });
    });

    // ✅ Audit log
    await logDelete(
      "bq_template",
      tenderId,
      {
        items: oldItems,
        categories: oldCategories,
      },
      session.user.id,
      request,
      {
        action: "clear_bq_template",
        tender_id: tenderId,
        items_deleted: oldItems.length,
        categories_deleted: oldCategories.length,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true, message: "BQ template cleared successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error clearing BQ template:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}