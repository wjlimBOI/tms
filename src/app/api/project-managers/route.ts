// app/api/project-managers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { logInsert, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";
import { sanitize } from "@/lib/sanitize";

const createPMSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string()
    .regex(/^\+[1-9]\d{1,14}$/, "Phone must be in E.164 format (e.g., +6512345678)")
    .optional()
    .nullable(),
});

// ---------- GET (read-only, no audit) ----------
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  let sql = `SELECT id, name, email, phone FROM project_managers`;
  const params: string[] = [];
  if (search) {
    sql += ` WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`;
    params.push(`%${search}%`);
  }
  sql += ` ORDER BY name LIMIT 50`;

  const result = await query(sql, params);
  return NextResponse.json(result.rows);
}

// ---------- POST (create project manager) ----------
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any).roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.ADMIN)) {
    await logAuthEvent("PERMISSION_DENIED", session.user.id, req, {
      action: "create_project_manager",
      reason: "Unauthorized",
      source: "api"
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validated = createPMSchema.parse(body);

    // Check email uniqueness
    const existing = await query(`SELECT id FROM project_managers WHERE email = $1`, [validated.email]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "A project manager with this email already exists" },
        { status: 409 }
      );
    }

    const result = await query(
      `INSERT INTO project_managers (name, email, phone) VALUES ($1, $2, $3) RETURNING *`,
      [sanitize(validated.name), validated.email, validated.phone || null]
    );
    const newPM = result.rows[0];

    // ✅ Audit log
    await logInsert(
      "project_managers",
      newPM.id,
      newPM,
      session.user.id,
      req,
      {
        action: "create_project_manager",
        name: newPM.name,
        email: newPM.email,
        source: "api"
      }
    );

    return NextResponse.json(newPM, { status: 201 });
  } catch (err) {
    console.error(err);
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}