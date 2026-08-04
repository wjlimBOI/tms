// app/api/user/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logUpdate, logAuthEvent } from "@/lib/audit";

// ---------- GET (read‑only, unchanged) ----------
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await query(
    `SELECT u.user_id, u.username, u.email,
            u.is_active, u.is_approved, u.access_start_date, u.access_end_date,
            u.is_team_member, u.employee_code, u.job_title,
            u.display_name,
            up.full_name, up.company_name, up.department, up.phone,
            COALESCE(
              (SELECT json_agg(json_build_object('role_id', r.role_id, 'role_name', r.role_name))
               FROM user_roles ur
               JOIN roles r ON ur.role_id = r.role_id
               WHERE ur.user_id = u.user_id),
              '[]'::json
            ) as roles
     FROM users u
     LEFT JOIN user_profile up ON u.user_id = up.user_id
     WHERE u.user_id = $1 AND u.is_deleted = false`,
    [session.user.id]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = result.rows[0];
  if (user.roles && user.roles.length > 0) {
    user.role_id = user.roles[0].role_id;
    user.role_name = user.roles[0].role_name;
  } else {
    user.role_id = null;
    user.role_name = null;
  }
  return NextResponse.json(user);
}

// ---------- PUT (update profile) ----------
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { full_name, display_name, company_name, department, phone } = body;

  // 1. Fetch old data for audit
  const oldDataResult = await query(
    `SELECT u.user_id, u.display_name, up.full_name, up.company_name, up.department, up.phone
     FROM users u
     LEFT JOIN user_profile up ON u.user_id = up.user_id
     WHERE u.user_id = $1`,
    [session.user.id]
  );
  if (oldDataResult.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const oldData = oldDataResult.rows[0];

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");

    // Update users table
    await client.query(
      `UPDATE users SET display_name = $1, updated_at = NOW() WHERE user_id = $2`,
      [display_name || null, session.user.id]
    );

    // Update user_profile
    await client.query(
      `INSERT INTO user_profile (user_id, full_name, company_name, department, phone, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         company_name = EXCLUDED.company_name,
         department = EXCLUDED.department,
         phone = EXCLUDED.phone,
         updated_at = NOW()`,
      [session.user.id, full_name, company_name, department, phone]
    );

    await client.query("COMMIT");

    // 2. Fetch new data for audit
    const newDataResult = await query(
      `SELECT u.user_id, u.display_name, up.full_name, up.company_name, up.department, up.phone
       FROM users u
       LEFT JOIN user_profile up ON u.user_id = up.user_id
       WHERE u.user_id = $1`,
      [session.user.id]
    );
    const newData = newDataResult.rows[0];

    // 3. Audit log
    await logUpdate(
      "user_profile",
      session.user.id,
      oldData,
      newData,
      session.user.id,
      req,
      {
        action: "update_profile",
        source: "api"
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  } finally {
    client.release();
  }
}