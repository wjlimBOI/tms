// app/api/admin/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logInsert, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";

// Zod schema for role creation
const createRoleSchema = z.object({
  role_name: z.string().min(1).max(50),
  display_name: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).optional().default(0),
});

// Helper: check if user is admin (role_id = 1 via user_roles)
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

// ---------- GET (existing) ----------
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
    const roles = await prisma.roles.findMany({
      select: {
        role_id: true,
        role_name: true,
        display_name: true,
        sort_order: true,
      },
      orderBy: [
        { sort_order: 'asc' },
        { role_name: 'asc' },
      ],
    });
    return NextResponse.json(roles, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching roles:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------- POST (create role) ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "create_role",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

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

  const validation = createRoleSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { role_name, display_name, sort_order } = validation.data;

  try {
    // Check if role_name already exists
    const existing = await prisma.roles.findUnique({
      where: { role_name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Role name already exists" },
        { status: 409, headers: corsHeaders }
      );
    }

    // Create the role
    const newRole = await prisma.roles.create({
      data: {
        role_name,
        display_name,
        sort_order: sort_order ?? 0,
      },
    });

    // ✅ Audit log the creation
    await logInsert(
      "role",
      newRole.role_id,
      newRole,
      session.user.id,
      request,
      {
        action: "create_role",
        role_name: newRole.role_name,
        display_name: newRole.display_name,
        sort_order: newRole.sort_order,
        source: "admin_api"
      }
    );

    return NextResponse.json(newRole, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error("Error creating role:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}