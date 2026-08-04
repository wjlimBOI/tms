// app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { passwordValidation } from "@/lib/validation";
import { logUpdate, logDelete, logAuthEvent } from "@/lib/audit";

// Zod schemas
const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(100).optional(),
  email: z.string().email().max(150).optional(),
  display_name: z.string().max(200).optional().nullable(),
  role_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
  access_start_date: z.string().date().nullable().optional(),
  access_end_date: z.string().date().nullable().optional(),
  company_name: z.string().max(200).optional().nullable(),
  password: z.string().optional(),
}).refine(
  (data) => {
    if (data.password && data.password.length > 0) {
      return passwordValidation.safeParse(data.password).success;
    }
    return true;
  },
  { message: "Password must meet complexity requirements", path: ["password"] }
);

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

// ---------- PUT – update user ----------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "update_user",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Validate user ID param
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid user ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const userId = idResult.data.id;

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

  const validation = updateUserSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const {
    username,
    email,
    display_name,
    role_id,
    is_active,
    access_start_date,
    access_end_date,
    company_name,
    password,
  } = validation.data;

  // 1. Fetch existing user (for audit and existence check)
  const oldUser = await prisma.users.findUnique({
    where: { user_id: userId },
    include: {
      user_profile: true,
      user_roles: {
        include: { roles: true },
      },
    },
  });
  if (!oldUser) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Safely access user_roles – cast to any to avoid type inference issues
  const userRoles = (oldUser as any).user_roles || [];
  const currentRoleId = userRoles.length > 0 ? userRoles[0].role_id : null;

  // 2. Build update data for users table
  const userUpdateData: any = {};
  const changedFields: string[] = [];

  if (username !== undefined && username !== oldUser.username) {
    userUpdateData.username = username;
    changedFields.push('username');
  }
  if (email !== undefined && email !== oldUser.email) {
    userUpdateData.email = email;
    changedFields.push('email');
  }
  if (is_active !== undefined && is_active !== oldUser.is_active) {
    userUpdateData.is_active = is_active;
    changedFields.push('is_active');
  }
  if (access_start_date !== undefined) {
    const newDate = access_start_date ? new Date(access_start_date) : null;
    const oldDate = oldUser.access_start_date;
    if (newDate?.toISOString() !== oldDate?.toISOString()) {
      userUpdateData.access_start_date = newDate;
      changedFields.push('access_start_date');
    }
  }
  if (access_end_date !== undefined) {
    const newDate = access_end_date ? new Date(access_end_date) : null;
    const oldDate = oldUser.access_end_date;
    if (newDate?.toISOString() !== oldDate?.toISOString()) {
      userUpdateData.access_end_date = newDate;
      changedFields.push('access_end_date');
    }
  }
  if (password && password.trim() !== "") {
    const pwdValid = passwordValidation.safeParse(password);
    if (!pwdValid.success) {
      return NextResponse.json(
        { error: "Password validation failed", details: pwdValid.error.issues },
        { status: 400, headers: corsHeaders }
      );
    }
    userUpdateData.password_hash = await bcrypt.hash(password, 12);
    userUpdateData.must_change_password = true;
    changedFields.push('password_hash', 'must_change_password');
  }

  // Role change detection
  let roleChanged = false;
  if (role_id !== undefined && role_id !== currentRoleId) {
    roleChanged = true;
    changedFields.push('role_id');
  }

  // Profile changes
  let profileChanged = false;
  const profileData: any = { updated_at: new Date() };
  if (company_name !== undefined) {
    const oldCompany = oldUser.user_profile?.company_name || null;
    if (company_name !== oldCompany) {
      profileData.company_name = company_name;
      profileChanged = true;
      changedFields.push('company_name');
    }
  }
  if (display_name !== undefined) {
    const oldDisplay = oldUser.user_profile?.full_name || null;
    if (display_name !== oldDisplay) {
      profileData.full_name = display_name;
      profileChanged = true;
      changedFields.push('display_name');
    }
  }

  // 3. Perform updates
  if (Object.keys(userUpdateData).length > 0) {
    userUpdateData.updated_at = new Date();
    await prisma.users.update({
      where: { user_id: userId },
      data: userUpdateData,
    });
  }

  // Handle role assignment – only if role_id is provided (even if null)
  if (roleChanged && role_id !== undefined) {
    await prisma.$transaction(async (tx) => {
      // Delete all existing roles
      await tx.user_roles.deleteMany({
        where: { user_id: userId },
      });
      // Assign new role if not null
      if (role_id !== null) {
        await tx.user_roles.create({
          data: {
            user_id: userId,
            role_id: role_id, // role_id is guaranteed to be a number here
            assigned_by: session.user.id,
            assigned_at: new Date(),
          },
        });
      }
    });
  }

  if (profileChanged) {
    await prisma.user_profile.upsert({
      where: { user_id: userId },
      update: profileData,
      create: {
        user_id: userId,
        ...profileData,
        created_at: new Date(),
      },
    });
  }

  // 4. Fetch updated user for audit
  const newUser = await prisma.users.findUnique({
    where: { user_id: userId },
    include: {
      user_profile: true,
      user_roles: {
        include: { roles: true },
      },
    },
  });

  // 5. Audit log the update (if any changes were made)
  if (changedFields.length > 0) {
    await logUpdate(
      "user",
      userId,
      oldUser,
      newUser,
      session.user.id,
      request,
      {
        action: "update_user",
        changed_fields: changedFields,
        source: "admin_api"
      }
    );
  }

  return NextResponse.json(
    { success: true, message: "User updated successfully" },
    { headers: corsHeaders }
  );
}

// ---------- DELETE – hard delete user ----------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "delete_user",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Validate user ID param
  const { id } = await params;
  const idResult = paramsSchema.safeParse({ id });
  if (!idResult.success) {
    return NextResponse.json(
      { error: "Invalid user ID", details: idResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const userId = idResult.data.id;

  // Fetch user for audit
  const oldUser = await prisma.users.findUnique({
    where: { user_id: userId },
    include: {
      user_profile: true,
      user_roles: {
        include: { roles: true },
      },
    },
  });
  if (!oldUser) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Hard delete in transaction
  await prisma.$transaction(async (tx) => {
    await tx.user_roles.deleteMany({ where: { user_id: userId } });
    await tx.user_profile.deleteMany({ where: { user_id: userId } });
    await tx.password_reset_tokens.deleteMany({ where: { user_id: userId } });
    await tx.auth_refresh_token.deleteMany({ where: { user_id: userId } });
    await tx.users.delete({ where: { user_id: userId } });
  });

  // Audit log the deletion
  await logDelete(
    "user",
    userId,
    oldUser,
    session.user.id,
    request,
    {
      action: "delete_user",
      username: oldUser.username,
      email: oldUser.email,
      source: "admin_api"
    }
  );

  return NextResponse.json(
    { success: true, message: "User deleted successfully" },
    { headers: corsHeaders }
  );
}