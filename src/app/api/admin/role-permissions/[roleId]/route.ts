// app/api/admin/role-permissions/[roleId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logUpdate, logAuthEvent } from "@/lib/audit"; // ✅ added audit imports
import { ROLE_IDS } from "@/lib/roles";

// Zod schema for params and body
const paramsSchema = z.object({
  roleId: z.coerce.number().int().positive(),
});

const putBodySchema = z.object({
  permission_ids: z.array(z.number().int().positive()),
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

// ---------- GET (unchanged) ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
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

  // Validate roleId param
  const { roleId } = await params;
  const idResult = paramsSchema.safeParse({ roleId });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid role ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const role_id = idResult.data.roleId;

  try {
    const permissions = await prisma.role_permissions.findMany({
      where: { role_id },
      select: { permission_id: true },
    });
    const permission_ids = permissions.map(p => p.permission_id);
    return NextResponse.json({ permission_ids }, { headers: corsHeaders });
  } catch (error) {
    console.error("Failed to fetch role permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------- PUT (replace permissions for a specific role) ----------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_role_permissions",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Validate roleId param
  const { roleId } = await params;
  const idResult = paramsSchema.safeParse({ roleId });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid role ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const role_id = idResult.data.roleId;

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

  const validation = putBodySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { permission_ids } = validation.data;
  const validPermissionIds = permission_ids.filter(id => id > 0);

  try {
    // 1. Fetch the old permissions before deletion (for audit)
    const oldPermissions = await prisma.role_permissions.findMany({
      where: { role_id },
      select: { permission_id: true },
    });
    const oldPermissionIds = oldPermissions.map(p => p.permission_id);

    // 2. Replace permissions in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.role_permissions.deleteMany({
        where: { role_id },
      });

      for (const permId of validPermissionIds) {
        await tx.role_permissions.create({
          data: {
            role_id,
            permission_id: permId,
          },
        });
      }
    });

    // 3. ✅ Audit log the update
    await logUpdate(
      "role_permissions",
      role_id,
      { permission_ids: oldPermissionIds },
      { permission_ids: validPermissionIds },
      session.user.id,
      request,
      {
        action: "update_role_permissions",
        role_id,
        old_permission_count: oldPermissionIds.length,
        new_permission_count: validPermissionIds.length,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true, message: "Permissions updated" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error updating role permissions:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}