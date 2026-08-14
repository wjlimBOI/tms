// app/api/admin/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logInsert, logAuthEvent } from "@/lib/audit";
import { ROLE_IDS } from "@/lib/roles";

// Zod schema for creating a permission
const createPermissionSchema = z.object({
  permission_code: z.string().min(1).max(100),
  permission_name: z.string().min(1).max(100),
  module: z.string().min(1).max(100),
});

async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: { in: [ROLE_IDS.ADMIN, ROLE_IDS.DEVELOPER] } },
  });
  return !!userRole;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ─── GET (unchanged) ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const permissions = await prisma.permissions.findMany({
      orderBy: [{ resource: 'asc' }, { description: 'asc' }],
      select: {
        permission_id: true,
        resource: true,
        action: true,
        description: true,
      },
    });
    // Preserve the API's original response shape (permission_code/permission_name/module)
    // so the frontend (admin/security/page.tsx) needs no changes.
    const shaped = permissions.map((p) => ({
      permission_id: p.permission_id,
      permission_code: p.action,
      permission_name: p.description,
      module: p.resource,
    }));
    return NextResponse.json(shaped, { headers: corsHeaders });
  } catch (error) {
    console.error("Failed to fetch permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ─── POST – create a new permission ──────────────────────────
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "create_permission",
      reason: "Unauthorized",
      source: "admin_api",
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
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

  const validation = createPermissionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { permission_code, permission_name, module } = validation.data;

  try {
    // Check for duplicate permission_code (globally unique, matching the old contract)
    const existing = await prisma.permissions.findFirst({
      where: { action: permission_code },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Permission code already exists" },
        { status: 409, headers: corsHeaders }
      );
    }

    const newPermission = await prisma.permissions.create({
      data: {
        resource: module,
        action: permission_code,
        description: permission_name,
      },
    });
    const shaped = {
      permission_id: newPermission.permission_id,
      permission_code: newPermission.action,
      permission_name: newPermission.description,
      module: newPermission.resource,
    };

    // Audit log
    await logInsert(
      "permissions",
      newPermission.permission_id,
      shaped,
      session.user.id,
      request,
      {
        action: "create_permission",
        permission_code,
        permission_name,
        module,
        source: "admin_api",
      }
    );

    return NextResponse.json(shaped, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error("Error creating permission:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}