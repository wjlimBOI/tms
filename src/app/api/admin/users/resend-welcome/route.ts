// app/api/admin/users/resend-welcome/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendWelcomeEmail } from "@/lib/email";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { logUpdate, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";

// Zod schema for request body
const resendWelcomeSchema = z.object({
  user_id: z.number().int().positive(),
});

function generateTempPassword(): string {
  return crypto.randomBytes(12).toString("base64").slice(0, 16);
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

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

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "resend_welcome",
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

  const validation = resendWelcomeSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { user_id } = validation.data;

  // Fetch user details
  const user = await prisma.users.findUnique({
    where: { user_id, is_deleted: false },
    select: { username: true, email: true, must_change_password: true, password_hash: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404, headers: corsHeaders }
    );
  }
  const { username, email } = user;

  // Generate new temporary password
  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  // Update password and force change on next login
  const updatedUser = await prisma.users.update({
    where: { user_id },
    data: {
      password_hash: hashedPassword,
      must_change_password: true,
      password_changed_at: new Date(),
      updated_at: new Date(),
    },
    select: { username: true, email: true, must_change_password: true },
  });

  // Generate password set token (expires in 24 hours)
  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  // Invalidate old unused tokens for this user
  await prisma.password_reset_tokens.updateMany({
    where: { user_id, used: false },
    data: { used: true },
  });

  // Create new token
  await prisma.password_reset_tokens.create({
    data: {
      user_id,
      token,
      expires_at: expiresAt,
    },
  });

  // Send email with token link
  await sendWelcomeEmail(email, username, tempPassword, token);

  // ✅ Audit log the resend – treat as an update with special action
  await logUpdate(
    "user",
    user_id,
    { password_hash: user.password_hash, must_change_password: user.must_change_password },
    { password_hash: hashedPassword, must_change_password: true },
    session.user.id,
    request,
    {
      action: "resend_welcome",
      username: user.username,
      email: user.email,
      reason: "Admin triggered password reset and welcome email resend",
      source: "admin_api"
    }
  );

  return NextResponse.json(
    { success: true, message: "Welcome email resent successfully" },
    { headers: corsHeaders }
  );
}