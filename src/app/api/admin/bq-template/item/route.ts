// src/app/api/admin/bq-template/item/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";
import { logInsert, logUpdate, logDelete, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";

// Zod schemas
const createSchema = z.object({
  tender_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  parent_item_id: z.number().int().positive().nullable().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().min(1).max(20),
  rate: z.number().nonnegative().nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

const updateSchema = z.object({
  item_id: z.number().int().positive(),
  description: z.string().min(1).max(500).optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().min(1).max(20).optional(),
  rate: z.number().nonnegative().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  parent_item_id: z.number().int().positive().nullable().optional(),
});

const patchSchema = z.object({
  updates: z.array(z.object({
    item_id: z.number().int().positive(),
    sort_order: z.number().int().min(0),
  })),
});

const deleteQuerySchema = z.object({
  id: z.string().regex(/^\d+$/, "id must be a numeric string"),
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
// POST – create a new template item
// ----------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "create_bq_item",
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

  const validation = createSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { tender_id, category_id, parent_item_id, description, quantity, unit, rate, sort_order } = validation.data;

  const sanitisedDescription = sanitize(description);
  const sanitisedUnit = sanitize(unit);

  try {
    const newItem = await prisma.bq_template_items.create({
      data: {
        tender_id,
        category_id,
        parent_item_id: parent_item_id || null,
        description: sanitisedDescription,
        quantity: quantity ?? null,
        unit: sanitisedUnit,
        rate: rate ?? null,
        sort_order: sort_order ?? 0,
      },
    });

    // ✅ Audit log
    await logInsert(
      "bq_template_items",
      newItem.item_id,
      newItem,
      session.user.id,
      request,
      {
        action: "create_bq_item",
        tender_id,
        description: newItem.description,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { item_id: newItem.item_id },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error creating template item:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ----------------------------------------------------------------------
// PUT – update an existing template item
// ----------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_bq_item",
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

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { item_id, description, quantity, unit, rate, sort_order, parent_item_id } = validation.data;

  // Fetch old data for audit
  const oldItem = await prisma.bq_template_items.findUnique({
    where: { item_id },
  });
  if (!oldItem) {
    return NextResponse.json(
      { error: "Item not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Build update data
  const updateData: any = {};
  const changedFields: string[] = [];
  if (description !== undefined && description !== oldItem.description) {
    updateData.description = sanitize(description);
    changedFields.push('description');
  }
  if (quantity !== undefined && quantity !== oldItem.quantity) {
    updateData.quantity = quantity === null ? null : quantity;
    changedFields.push('quantity');
  }
  if (unit !== undefined && unit !== oldItem.unit) {
    updateData.unit = sanitize(unit);
    changedFields.push('unit');
  }
  if (rate !== undefined && Number(rate) !== Number(oldItem.rate)) {
    updateData.rate = rate === null ? null : rate;
    changedFields.push('rate');
  }
  if (sort_order !== undefined && sort_order !== oldItem.sort_order) {
    updateData.sort_order = sort_order;
    changedFields.push('sort_order');
  }
  if (parent_item_id !== undefined && parent_item_id !== oldItem.parent_item_id) {
    updateData.parent_item_id = parent_item_id === null ? null : parent_item_id;
    changedFields.push('parent_item_id');
  }

  // If no changes, return early
  if (changedFields.length === 0) {
    return NextResponse.json(
      { success: true, message: "No changes applied" },
      { headers: corsHeaders }
    );
  }

  updateData.updated_at = new Date();

  try {
    const updatedItem = await prisma.bq_template_items.update({
      where: { item_id },
      data: updateData,
    });

    // ✅ Audit log
    await logUpdate(
      "bq_template_items",
      item_id,
      oldItem,
      updatedItem,
      session.user.id,
      request,
      {
        action: "update_bq_item",
        changed_fields: changedFields,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error updating template item:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ----------------------------------------------------------------------
// DELETE – delete a single template item
// ----------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "delete_bq_item",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const idParam = searchParams.get("id");
  const validation = deleteQuerySchema.safeParse({ id: idParam });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid id", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const itemId = parseInt(validation.data.id, 10);

  // Fetch old data for audit
  const oldItem = await prisma.bq_template_items.findUnique({
    where: { item_id: itemId },
  });
  if (!oldItem) {
    return NextResponse.json(
      { error: "Item not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  try {
    await prisma.bq_template_items.delete({
      where: { item_id: itemId },
    });

    // ✅ Audit log
    await logDelete(
      "bq_template_items",
      itemId,
      oldItem,
      session.user.id,
      request,
      {
        action: "delete_bq_item",
        description: oldItem.description,
        tender_id: oldItem.tender_id,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error deleting template item:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ----------------------------------------------------------------------
// PATCH – batch update sort_order
// ----------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "batch_update_bq_items",
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

  const validation = patchSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { updates } = validation.data;

  // Fetch old data for all items
  const itemIds = updates.map(u => u.item_id);
  const oldItems = await prisma.bq_template_items.findMany({
    where: { item_id: { in: itemIds } },
  });

  // Verify all items exist
  if (oldItems.length !== itemIds.length) {
    const foundIds = oldItems.map(i => i.item_id);
    const missing = itemIds.filter(id => !foundIds.includes(id));
    return NextResponse.json(
      { error: `Items with IDs ${missing.join(', ')} not found` },
      { status: 404, headers: corsHeaders }
    );
  }

  try {
    // Update in transaction
    const updatedItems = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const update of updates) {
        const updated = await tx.bq_template_items.update({
          where: { item_id: update.item_id },
          data: { sort_order: update.sort_order },
        });
        results.push(updated);
      }
      return results;
    });

    // ✅ Audit log – batch update (use placeholder ID 0)
    await logUpdate(
      "bq_template_items",
      0,
      oldItems,
      updatedItems,
      session.user.id,
      request,
      {
        action: "batch_update_bq_items",
        updated_items: updates.map(u => u.item_id),
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Error reordering items:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}