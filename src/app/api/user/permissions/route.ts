// src/app/api/user/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const permissions = await prisma.$queryRaw`
      SELECT DISTINCT p.permission_code
      FROM user_roles ur
      JOIN role_permission rp ON ur.role_id = rp.role_id
      JOIN permission p ON rp.permission_id = p.permission_id
      WHERE ur.user_id = ${session.user.id}
    ` as { permission_code: string }[];

    const permissionCodes = permissions.map(row => row.permission_code);
    return NextResponse.json(
      { permissions: permissionCodes },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}