// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendWelcomeEmail } from "@/lib/email";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { z } from "zod";
import { passwordValidation } from "@/lib/validation";
import { logInsert, logAuthEvent } from "@/lib/audit";
import { sanitize } from "@/lib/sanitize";
import { ROLE_IDS } from "@/lib/roles";

// ─── Zod Schemas ───────────────────────────────────────────────

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional().nullable(),
  role_id: z.coerce.number().int().positive().optional().nullable(),
  exclude_role_id: z.coerce.number().int().positive().optional().nullable(),
  is_active: z.coerce.boolean().optional().nullable(),
  is_approved: z.coerce.boolean().optional().nullable(),
});

const createUserSchema = z.object({
  username: z.string().min(3).max(100),
  email: z.string().email().max(150),
  display_name: z.string().max(200).nullable().optional(),
  role_id: z.number().int().positive(),
  is_active: z.boolean().default(true),
  access_start_date: z.string().date().nullable().optional(),
  access_end_date: z.string().date().nullable().optional(),
  company_name: z.string().max(200).nullable().optional(),
});

// ─── Helpers ───────────────────────────────────────────────────

function generateTempPassword(): string {
  return crypto.randomBytes(12).toString("base64").slice(0, 16);
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: { in: [ROLE_IDS.ADMIN, ROLE_IDS.DEVELOPER] } },
  });
  return !!userRole;
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
  if (!session || !(await isAdmin(session.user.id))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryResult = querySchema.safeParse({
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    search: searchParams.get("search"),
    role_id: searchParams.get("role_id"),
    exclude_role_id: searchParams.get("exclude_role_id"),
    is_active: searchParams.get("is_active"),
    is_approved: searchParams.get("is_approved"),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryResult.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { page, limit, search, role_id, exclude_role_id, is_active, is_approved } = queryResult.data;
  const offset = (page - 1) * limit;

  try {
    // ─── Build WHERE clause ──────────────────────────────────
    const conditions: string[] = ["u.is_deleted = false"];
    const params: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(u.username ILIKE $${idx} OR u.email ILIKE $${idx + 1})`);
      params.push(`%${search}%`, `%${search}%`);
      idx += 2;
    }

    if (role_id != null) {
      conditions.push(`EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role_id = $${idx})`);
      params.push(role_id);
      idx++;
    }

    if (exclude_role_id != null) {
      conditions.push(`NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role_id = $${idx})`);
      params.push(exclude_role_id);
      idx++;
    }

    if (is_active != null) {
      conditions.push(`u.is_active = $${idx}`);
      params.push(is_active);
      idx++;
    }

    if (is_approved != null) {
      conditions.push(`u.is_approved = $${idx}`);
      params.push(is_approved);
      idx++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // ─── Count ──────────────────────────────────────────────
    const countSql = `SELECT COUNT(*) FROM users u ${whereClause}`;
    const countResult = await prisma.$queryRawUnsafe<any[]>(countSql, ...params);
    const total = Number(countResult[0]?.count || 0);

    if (total === 0) {
      return NextResponse.json(
        { users: [], total: 0, totalPages: 0, currentPage: page },
        { headers: corsHeaders }
      );
    }

    // ─── Fetch users + profiles ─────────────────────────────
    const usersSql = `
      SELECT
        u.user_id, u.username, u.email, u.is_active, u.is_approved,
        u.access_start_date, u.access_end_date, u.last_login, u.created_at,
        up.full_name, up.company_name, up.department, up.job_title, up.phone
      FROM users u
      LEFT JOIN user_profile up ON u.user_id = up.user_id
      ${whereClause}
      ORDER BY u.username
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const userParams = [...params, limit, offset];
    const users = await prisma.$queryRawUnsafe<any[]>(usersSql, ...userParams);

    if (users.length === 0) {
      return NextResponse.json(
        { users: [], total, totalPages: 0, currentPage: page },
        { headers: corsHeaders }
      );
    }

    // ─── Fetch roles for these users ──────────────────────
    const userIds = users.map((u) => u.user_id);
    // Build IN placeholders and collect all parameters
    const rolePlaceholders = userIds.map((_, i) => `$${idx + i}`).join(", ");
    const rolesSql = `
      SELECT ur.user_id, r.role_id, r.role_name, r.display_name, r.sort_order
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id IN (${rolePlaceholders})
    `;
    const roleParams = [...params, ...userIds];
    const roles = await prisma.$queryRawUnsafe<any[]>(rolesSql, ...roleParams);

    // ─── Group roles by user_id ────────────────────────────
    const rolesMap: Record<number, any[]> = {};
    for (const row of roles) {
      if (!rolesMap[row.user_id]) rolesMap[row.user_id] = [];
      rolesMap[row.user_id].push({
        role_id: row.role_id,
        role_name: row.role_name,
        display_name: row.display_name,
        sort_order: row.sort_order,
      });
    }

    // ─── Format response ────────────────────────────────────
    const formattedUsers = users.map((user: any) => {
      const userRoles = rolesMap[user.user_id] || [];
      const firstRole = userRoles.length > 0 ? userRoles[0] : null;
      return {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        is_active: user.is_active,
        is_approved: user.is_approved,
        access_start_date: user.access_start_date,
        access_end_date: user.access_end_date,
        last_login: user.last_login,
        created_at: user.created_at,
        full_name: user.full_name || null,
        company_name: user.company_name || null,
        department: user.department || null,
        job_title: user.job_title || null,
        phone: user.phone || null,
        roles: userRoles,
        role_id: firstRole?.role_id || null,
        role_name: firstRole?.role_name || null,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        users: formattedUsers,
        total,
        totalPages,
        currentPage: page,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "create_user",
      reason: "Unauthorized",
      source: "admin_api",
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  const validation = createUserSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const {
    email,
    role_id,
    is_active,
    access_start_date,
    access_end_date,
  } = validation.data;
  const username = sanitize(validation.data.username);
  const company_name = validation.data.company_name ? sanitize(validation.data.company_name) : validation.data.company_name;
  const display_name = validation.data.display_name ? sanitize(validation.data.display_name) : validation.data.display_name;

  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);
  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: {
          username,
          email,
          password_hash: hashedPassword,
          role_id,
          is_active: is_active ?? true,
          is_approved: true,
          access_start_date: access_start_date ? new Date(access_start_date) : null,
          access_end_date: access_end_date ? new Date(access_end_date) : null,
          must_change_password: true,
        },
        select: { user_id: true, username: true, email: true, role_id: true },
      });

      await tx.user_roles.create({
        data: {
          user_id: newUser.user_id,
          role_id,
          assigned_by: session.user.id,
          assigned_at: new Date(),
        },
      });

      await tx.user_profile.create({
        data: {
          user_id: newUser.user_id,
          company_name: company_name || null,
          full_name: display_name || null,
        },
      });

      await tx.password_reset_tokens.create({
        data: {
          user_id: newUser.user_id,
          token,
          expires_at: expiresAt,
        },
      });

      return newUser;
    });

    await sendWelcomeEmail(email, username, tempPassword, token);

    await logInsert(
      "user",
      result.user_id,
      {
        username: result.username,
        email: result.email,
        role_id: result.role_id,
        is_active,
        access_start_date,
        access_end_date,
        company_name,
      },
      session.user.id,
      request,
      {
        action: "create_user",
        username: result.username,
        email: result.email,
        role_id: result.role_id,
        source: "admin_api",
      }
    );

    return NextResponse.json(
      { user_id: result.user_id, message: "User created successfully" },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("POST /api/admin/users error:", error);
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 409, headers: corsHeaders }
      );
    }
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  }
}