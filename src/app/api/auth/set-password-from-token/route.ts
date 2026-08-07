import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { passwordValidation } from "@/lib/validation";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractAuditContext } from "@/lib/audit";

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

  const { ipAddress } = extractAuditContext(request);
  const { success: withinLimit } = await checkRateLimit(`pwreset-set:${ipAddress}`);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: corsHeaders }
    );
  }

  try {
    // 1. Parse and validate request body
    const { token, new_password } = await request.json();
    if (!token || !new_password) {
      return NextResponse.json(
        { error: "Missing token or password" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 2. Validate password strength
    const validation = passwordValidation.safeParse(new_password);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Password validation failed", details: validation.error.issues[0].message },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Sanitise inputs
    const sanitisedToken = sanitize(token);
    const sanitisedPassword = sanitize(new_password);

    // 4. Verify token (valid, unused, not expired)
    const tokenRecord = await prisma.password_reset_tokens.findFirst({
      where: {
        token: sanitisedToken,
        used: false,
        expires_at: { gt: new Date() },
      },
      select: { user_id: true },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 5. Hash new password
    const hashedPassword = await bcrypt.hash(sanitisedPassword, 12);

    // 6. Update user password and reset flag
    await prisma.users.update({
      where: { user_id: tokenRecord.user_id },
      data: {
        password_hash: hashedPassword,
        must_change_password: false,
        password_changed_at: new Date(),
        updated_at: new Date(),
      },
    });

    // 7. Mark token as used
    await prisma.password_reset_tokens.update({
      where: { token: sanitisedToken },
      data: { used: true },
    });

    // 8. (Optional) Store old password in history – skip for now

    return NextResponse.json(
      { success: true, message: "Password set successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Set‑password‑from‑token error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}