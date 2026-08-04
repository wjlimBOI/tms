import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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

  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json(
        { valid: false },
        { status: 400, headers: corsHeaders }
      );
    }

    const sanitisedToken = sanitize(token);

    // Check token validity (unused, not expired)
    const tokenRecord = await prisma.password_reset_tokens.findFirst({
      where: {
        token: sanitisedToken,
        used: false,
        expires_at: { gt: new Date() },
      },
      select: { id: true },
    });

    const valid = !!tokenRecord;
    return NextResponse.json(
      { valid },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { valid: false },
      { status: 500, headers: corsHeaders }
    );
  }
}