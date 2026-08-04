// app/api/admin/approval-chains/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";
import { logUpdate, logAuthEvent } from "@/lib/audit";

// Zod schemas
const stepSchema = z.object({
  role_id: z.number().int().positive(),
  can_approve: z.boolean().default(true),
  can_reject: z.boolean().default(true),
  requires_comment: z.boolean().default(false),
  deadline_hours: z.number().int().positive().nullable().optional(),
});

const postBodySchema = z.object({
  resource_type: z.string().min(1),
  steps: z.array(stepSchema),
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

  const searchParams = request.nextUrl.searchParams;
  const resourceType = searchParams.get('resource_type');

  try {
    const where: any = {};
    if (resourceType) {
      where.resource_type = resourceType;
    }

    const chains = await prisma.approval_chains.findMany({
      where,
      include: {
        roles: {
          select: {
            role_name: true,
          },
        },
      },
      orderBy: [
        { resource_type: 'asc' },
        { step_order: 'asc' },
      ],
    });

    return NextResponse.json(chains, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching approval chains:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------- POST – replace all steps for a resource_type ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_approval_chain",
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

  const { resource_type, steps } = validation.data;
  const sanitisedResourceType = sanitize(resource_type);

  // Verify all role_ids exist
  const roleIds = steps.map(s => s.role_id);
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
    // 1. Fetch old steps for this resource_type (for audit)
    const oldSteps = await prisma.approval_chains.findMany({
      where: { resource_type: sanitisedResourceType },
      select: {
        step_order: true,
        role_id: true,
        can_approve: true,
        can_reject: true,
        requires_comment: true,
        deadline_hours: true,
      },
      orderBy: { step_order: 'asc' },
    });

    // 2. Replace in transaction
    await prisma.$transaction(async (tx) => {
      await tx.approval_chains.deleteMany({
        where: { resource_type: sanitisedResourceType },
      });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await tx.approval_chains.create({
          data: {
            resource_type: sanitisedResourceType,
            step_order: i + 1,
            role_id: step.role_id,
            can_approve: step.can_approve,
            can_reject: step.can_reject,
            requires_comment: step.requires_comment,
            deadline_hours: step.deadline_hours || null,
          },
        });
      }
    });

    // 3. Audit log the update (using placeholder ID 0)
    await logUpdate(
      "approval_chains",
      0,
      oldSteps,
      steps,
      session.user.id,
      request,
      {
        action: "update_approval_chain",
        resource_type: sanitisedResourceType,
        source: "admin_api",
        old_step_count: oldSteps.length,
        new_step_count: steps.length,
      }
    );

    return NextResponse.json(
      { success: true, message: "Approval chain updated successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error saving approval chain:", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}