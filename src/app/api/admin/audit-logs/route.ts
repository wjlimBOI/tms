// app/api/admin/audit-logs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";

// ─── Schema ──────────────────────────────────────────────────
const querySchema = z
  .object({
    limit: z.coerce.number().int().positive().optional().nullable(),
    page: z.coerce.number().int().positive().optional().nullable(),
    offset: z.coerce.number().int().nonnegative().optional().nullable(),
    action: z.string().optional().nullable(),
    user: z.string().optional().nullable(),
    resource: z.string().optional().nullable(),
  })
  .passthrough();

// ─── Authorisation ────────────────────────────────────────────
async function isAuthorized(userId: number): Promise<boolean> {
  const userRoles = await prisma.user_roles.findMany({
    where: { user_id: userId },
    include: { roles: { select: { role_id: true, role_name: true } } },
  });
  return userRoles.some(
    (ur) => ur.roles.role_id === 1 || ur.roles.role_name === "Auditor"
  );
}

// ─── OPTIONS (CORS) ──────────────────────────────────────────
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ─── GET ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAuthorized(session.user.id))) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryResult = querySchema.safeParse({
    limit: searchParams.get("limit"),
    page: searchParams.get("page"),
    offset: searchParams.get("offset"),
    action: searchParams.get("action"),
    user: searchParams.get("user"),
    resource: searchParams.get("resource"),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { limit, page, offset, action, user, resource } = queryResult.data;

  // ─── Pagination ─────────────────────────────────────────────
  const finalLimit = limit ?? 100;
  let finalOffset = 0;
  if (offset != null) finalOffset = offset;
  else if (page != null) finalOffset = (page - 1) * finalLimit;

  // ─── Build WHERE clause ─────────────────────────────────────
  const whereConditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (action) {
    whereConditions.push(`a.action = $${idx}`);
    params.push(sanitize(action));
    idx++;
  }

  if (resource) {
    whereConditions.push(`a.table_name = $${idx}`);
    params.push(sanitize(resource));
    idx++;
  }

  if (user) {
    const userId = Number(user);
    if (!isNaN(userId) && userId > 0) {
      whereConditions.push(`a.changed_by = $${idx}`);
      params.push(userId);
      idx++;
    }
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // ─── Query with username join ──────────────────────────────
  const sql = `
    SELECT
      a.audit_id,
      a.table_name,
      a.record_id,
      a.action,
      a.old_data,
      a.new_data,
      a.changed_by,
      a.changed_at,
      a.ip_address,
      a.user_agent,
      a.request_id,
      a.details,
      u.username
    FROM audit_log a
    LEFT JOIN users u ON a.changed_by = u.user_id
    ${whereClause}
    ORDER BY a.changed_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  params.push(finalLimit, finalOffset);

  try {
    const result = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // ─── Map rows to frontend‑expected shape and convert BigInt ──
    const rows = result.map((row) => ({
      // Use audit_id as a string (or number) – frontend expects a unique id
      id: Number(row.audit_id),
      timestamp: row.changed_at,
      user_id: row.changed_by ? Number(row.changed_by) : null,
      username: row.username || `User ${row.changed_by || 'unknown'}`,
      action: row.action,
      resource_type: row.table_name,
      resource_id: row.record_id ? Number(row.record_id) : null,
      old_data: row.old_data,
      new_data: row.new_data,
      details: row.details,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      request_id: row.request_id ? Number(row.request_id) : null,
    }));

    return NextResponse.json(rows, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}