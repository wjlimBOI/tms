import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { passwordValidation } from "@/lib/validation";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";

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
    // 1b. This endpoint deliberately skips the current-password check
    // user/change-password enforces, because the forced first-login flow
    // means the user just typed their current (temp) password to log in.
    // Restrict it to that actual case — otherwise it's a way for anyone
    // holding a valid session to silently reset their own password without
    // re-proving they know the current one.
    const currentUser = await prisma.users.findUnique({
      where: { user_id: session.user.id },
      select: { must_change_password: true },
    });
    if (!currentUser?.must_change_password) {
      return NextResponse.json(
        { error: "Password change is not required for this account" },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Parse and validate body
    const { new_password, agreed_to_terms } = await request.json();
    if (!new_password) {
      return NextResponse.json(
        { error: "New password required" },
        { status: 400, headers: corsHeaders }
      );
    }
    if (agreed_to_terms !== true) {
      return NextResponse.json(
        { error: "You must agree to the Terms of Use and Privacy Policy to continue" },
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

    // 4. Hash the new password directly — do not sanitize it first.
    // sanitize() would HTML-escape exactly the special characters
    // passwordValidation requires, silently corrupting the hash and locking
    // the user out. Passwords are never rendered as HTML, so there's no XSS
    // reason to alter them before hashing.
    const hashed = await bcrypt.hash(new_password, 12);

    // 6. Update user
    await prisma.users.update({
      where: { user_id: session.user.id },
      data: {
        password_hash: hashed,
        must_change_password: false,
        password_changed_at: new Date(),
        updated_at: new Date(),
        terms_accepted_at: new Date(),
        terms_accepted_version: CURRENT_TERMS_VERSION,
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