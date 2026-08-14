// src/app/api/admin/bqs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { sanitize } from "@/lib/sanitize";
import { ROLE_IDS } from "@/lib/roles";

// Zod schemas
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

// ----------------------------------------------------------------------
// GET /api/admin/bqs/[id]
// ----------------------------------------------------------------------
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

  // Validate ID parameter
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid BQ ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const submissionId = idResult.data.id;

  try {
    // 1. Fetch submission with line items and categories
    const submission = await prisma.tender_submission.findUnique({
      where: {
        submission_id: submissionId,
        is_deleted: false,
      },
      include: {
        line_items: {
          include: {
            work_category: {
              select: {
                category_id: true,
                category_name: true,
                sort_order: true,
              },
            },
          },
          orderBy: [{ category_id: 'asc' }, { sort_order: 'asc' }],
        },
        submission_category: {
          include: {
            work_category: {
              select: {
                category_id: true,
                category_name: true,
                sort_order: true,
              },
            },
          },
          orderBy: { sort_order: 'asc' },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "BQ not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Compute total amount – FIX: convert Decimal to number
    const totalAmount = submission.line_items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    // 3. Build categories list from submission_category (or from line items if none)
    let categories = submission.submission_category.map(sc => ({
      category_id: sc.work_category.category_id,
      category_name: sc.work_category.category_name,
      sort_order: sc.work_category.sort_order,
    }));
    // If no categories defined in submission_category, derive from line items
    if (categories.length === 0) {
      const catMap = new Map<number, { category_id: number; category_name: string; sort_order: number }>();
      for (const item of submission.line_items) {
        if (item.category_id && item.work_category) {
          const cat = item.work_category;
          if (!catMap.has(cat.category_id)) {
            catMap.set(cat.category_id, {
              category_id: cat.category_id,
              category_name: cat.category_name,
              sort_order: cat.sort_order,
            });
          }
        }
      }
      categories = Array.from(catMap.values()).sort((a, b) => a.sort_order - b.sort_order);
    }

    // 4. Assign item numbers (cat_num.item_num)
    const catNumMap = new Map<number, number>();
    categories.forEach((cat, index) => {
      catNumMap.set(cat.category_id, index + 1);
    });

    // Group line items by category
    const itemsByCategory = new Map<number, typeof submission.line_items>();
    for (const item of submission.line_items) {
      if (item.category_id) {
        if (!itemsByCategory.has(item.category_id)) {
          itemsByCategory.set(item.category_id, []);
        }
        itemsByCategory.get(item.category_id)!.push(item);
      }
    }

    // Assign item numbers
    const itemsWithNumbers = submission.line_items.map(item => {
      const catNum = item.category_id ? catNumMap.get(item.category_id) : null;
      const catItems = item.category_id ? itemsByCategory.get(item.category_id) || [] : [];
      const subIndex = catItems.findIndex(li => li.line_item_id === item.line_item_id);
      const itemNum = catNum !== null && subIndex !== -1 ? subIndex + 1 : null;
      return {
        ...item,
        item_no: catNum !== null && itemNum !== null ? `${catNum}.${itemNum}` : null,
      };
    });

    // 5. Prepare response
    return NextResponse.json(
      {
        submission,
        categories,
        items: itemsWithNumbers,
        total_amount: totalAmount,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching BQ:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ----------------------------------------------------------------------
// DELETE /api/admin/bqs/[id]?hard=true|false (default soft)
// ----------------------------------------------------------------------
export async function DELETE(
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

  // Validate ID parameter
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid BQ ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const submissionId = idResult.data.id;

  // Parse hard delete flag
  const searchParams = request.nextUrl.searchParams;
  const hard = searchParams.get('hard') === 'true';

  // Check if submission exists and is not already deleted (for soft delete)
  const existing = await prisma.tender_submission.findUnique({
    where: { submission_id: submissionId },
    select: { submission_id: true, is_deleted: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "BQ not found" },
      { status: 404, headers: corsHeaders }
    );
  }
  if (!hard && existing.is_deleted) {
    return NextResponse.json(
      { error: "BQ already deleted" },
      { status: 409, headers: corsHeaders }
    );
  }

  const awardedAs = await prisma.tender_award.findFirst({
    where: { final_submission_id: submissionId },
    select: { award_id: true },
  });
  if (awardedAs) {
    return NextResponse.json(
      { error: "This BQ is the awarded winning submission for its tender and cannot be deleted" },
      { status: 409, headers: corsHeaders }
    );
  }

  try {
    if (hard) {
      // Hard delete – cascade manually
      await prisma.$transaction(async (tx) => {
        await tx.bq_line_item.deleteMany({
          where: { submission_id: submissionId },
        });
        await tx.submission_category.deleteMany({
          where: { submission_id: submissionId },
        });
        await tx.tender_submission.delete({
          where: { submission_id: submissionId },
        });
      });
    } else {
      // Soft delete
      await prisma.tender_submission.update({
        where: { submission_id: submissionId },
        data: { is_deleted: true, updated_at: new Date() },
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: `BQ ${submissionId} ${hard ? 'permanently' : 'soft'} deleted.`,
        submission_id: submissionId,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error deleting BQ:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}