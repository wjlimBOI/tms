// app/api/messages/directory/route.ts
// Lightweight, non-admin-safe user search for the "start a new conversation"
// picker. Deliberately NOT the admin-only /api/admin/users route — any
// authenticated user (including Contractors, per the 2026-08-19 decision
// that anyone can be messaged) can search for anyone else here, but only
// gets back minimal fields, not the full admin profile shape.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { messagesDirectorySchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const user = session.user as any;
  const searchParams = request.nextUrl.searchParams;
  const parsed = messagesDirectorySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A search term is required", details: parsed.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { search, limit } = parsed.data;

  const result = await query(
    `SELECT u.user_id, u.username, COALESCE(up.full_name, u.display_name) AS display_name, u.email
     FROM users u
     LEFT JOIN user_profile up ON up.user_id = u.user_id
     WHERE u.is_deleted = false AND u.user_id != $1
       AND (u.username ILIKE $2 OR u.display_name ILIKE $2 OR up.full_name ILIKE $2 OR u.email ILIKE $2)
     ORDER BY COALESCE(up.full_name, u.display_name, u.username) ASC
     LIMIT $3`,
    [user.id, `%${search}%`, limit]
  );

  return NextResponse.json({ data: result.rows }, { headers: corsHeaders });
}
