// app/api/admin/roles/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logDelete, logUpdate, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";

// Zod schemas
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateRoleSchema = z.object({
  role_name: z.string().min(1).max(50).optional(),
  display_name: z.string().min(1).max(100).optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
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

// ---------- GET (optional – fetch single role) ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid role ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const roleId = idResult.data.id;

  try {
    const role = await prisma.roles.findUnique({
      where: { role_id: roleId },
      select: {
        role_id: true,
        role_name: true,
        display_name: true,
        sort_order: true,
      },
    });
    if (!role) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404, headers: corsHeaders }
      );
    }
    return NextResponse.json(role, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching role:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------- PUT (update role) ----------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_role",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Validate role ID param
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid role ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const roleId = idResult.data.id;

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  const validation = updateRoleSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const updateData = validation.data;

  try {
    // Fetch the existing role (for audit and existence check)
    const oldRole = await prisma.roles.findUnique({
      where: { role_id: roleId },
    });
    if (!oldRole) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // If role_name is being updated, check uniqueness
    if (updateData.role_name && updateData.role_name !== oldRole.role_name) {
      const existing = await prisma.roles.findUnique({
        where: { role_name: updateData.role_name },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Role name already exists" },
          { status: 409, headers: corsHeaders }
        );
      }
    }

    // Perform update
    const updatedRole = await prisma.roles.update({
      where: { role_id: roleId },
      data: updateData,
    });

    // ✅ Audit log the update
    await logUpdate(
      "role",
      roleId,
      oldRole,
      updatedRole,
      session.user.id,
      request,
      {
        action: "update_role",
        changed_fields: Object.keys(updateData),
        source: "admin_api"
      }
    );

    return NextResponse.json(updatedRole, { headers: corsHeaders });
  } catch (error) {
    console.error("Error updating role:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------- DELETE (existing, now with audit) ----------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "delete_role",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Validate role ID param
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid role ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const roleId = idResult.data.id;

  try {
    // Fetch the role before deletion (for audit oldData)
    const role = await prisma.roles.findUnique({
      where: { role_id: roleId },
      select: {
        role_id: true,
        role_name: true,
        display_name: true,
        sort_order: true,
      },
    });
    if (!role) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Check if role is in use (has users assigned)
    const usersWithRole = await prisma.user_roles.count({
      where: { role_id: roleId },
    });
    if (usersWithRole > 0) {
      return NextResponse.json(
        { error: "Cannot delete role that is assigned to users" },
        { status: 409, headers: corsHeaders } // 409 Conflict
      );
    }

    // Delete related records and the role itself inside a transaction
    await prisma.$transaction(async (tx) => {
      await tx.role_permissions.deleteMany({
        where: { role_id: roleId },
      });
      await tx.approval_chains.deleteMany({
        where: { role_id: roleId },
      });
      await tx.roles.delete({
        where: { role_id: roleId },
      });
    });

    // ✅ Audit log the deletion
    await logDelete(
      "role",
      roleId,
      role, // oldData
      session.user.id,
      request,
      {
        action: "delete_role",
        role_name: role.role_name,
        display_name: role.display_name,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true, message: "Role deleted successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error deleting role:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}