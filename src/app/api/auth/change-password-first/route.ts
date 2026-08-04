import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { passwordValidation } from "@/lib/validation";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";

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

  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    // 2. Parse and validate body
    const { new_password } = await request.json();
    if (!new_password) {
      return NextResponse.json(
        { error: "New password required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Validate password strength using centralised schema
    const validation = passwordValidation.safeParse(new_password);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Password validation failed", details: validation.error.issues[0].message },
        { status: 400, headers: corsHeaders }
      );
    }

    // 4. Sanitise (just in case, but password is hashed)
    const sanitisedPassword = sanitize(new_password);

    // 5. Hash the new password
    const hashed = await bcrypt.hash(sanitisedPassword, 12);

    // 6. Update user
    await prisma.users.update({
      where: { user_id: session.user.id },
      data: {
        password_hash: hashed,
        must_change_password: false,
        updated_at: new Date(),
      },
    });

    // 7. (Optional) Save old password to history – skip for now

    return NextResponse.json(
      { success: true, message: "Password updated successfully" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Change‑password‑first error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}