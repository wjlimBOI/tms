// app/api/admin/access-windows/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";
import { logUpdate, logAuthEvent } from "@/lib/audit";

// Zod schemas
const accessWindowSchema = z.object({
  role_id: z.number().int().positive(),
  resource_type: z.string().min(1),
  can_view_from: z.string().datetime({ offset: true }).nullable().optional(),
  can_view_until: z.string().datetime({ offset: true }).nullable().optional(),
});

const postBodySchema = z.object({
  windows: z.array(accessWindowSchema),
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

// ---------- GET ----------
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
    const result = await prisma.$queryRaw`
      SELECT role_id, resource_type, can_view_from, can_view_until
      FROM access_windows
      ORDER BY role_id, resource_type
    `;
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching access windows:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------- POST – bulk upsert (replace all) ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_access_windows",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Parse and validate body
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

  const { windows } = validation.data;
  const sanitisedWindows = windows.map(win => ({
    ...win,
    resource_type: sanitize(win.resource_type),
  }));

  // Verify all role_ids exist
  const roleIds = sanitisedWindows.map(w => w.role_id);
  const existingRoles = await prisma.roles.findMany({
    where: { role_id: { in: roleIds } },
    select: { role_id: true },
  });
  const existingRoleIds = existingRoles.map(r => r.role_id);
  const missingRoles = roleIds.filter(id => !existingRoleIds.includes(id));
  if (missingRoles.length > 0) {
    return NextResponse.json(
      { error: `Role(s) with IDs ${missingRoles.join(', ')} do not exist` },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 1. Fetch old windows for audit (before deletion)
    const oldWindows = await prisma.$queryRaw`
      SELECT role_id, resource_type, can_view_from, can_view_until
      FROM access_windows
      ORDER BY role_id, resource_type
    `;

    // 2. Replace all in transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM access_windows`;
      for (const win of sanitisedWindows) {
        await tx.$executeRaw`
          INSERT INTO access_windows (role_id, resource_type, can_view_from, can_view_until)
          VALUES (${win.role_id}, ${win.resource_type}, ${win.can_view_from || null}, ${win.can_view_until || null})
        `;
      }
    });

    // 3. Audit log the update (using placeholder ID 0)
    await logUpdate(
      "access_windows",
      0,
      oldWindows,
      sanitisedWindows,
      session.user.id,
      request,
      {
        action: "update_access_windows",
        source: "admin_api",
        old_count: Array.isArray(oldWindows) ? oldWindows.length : 0,
        new_count: sanitisedWindows.length,
      }
    );

    return NextResponse.json(
      { success: true, message: "Access windows updated successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error saving access windows:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}