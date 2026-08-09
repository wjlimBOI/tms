import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { passwordValidation } from "@/lib/validation";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";

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