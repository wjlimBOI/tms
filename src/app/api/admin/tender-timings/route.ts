// app/api/admin/tender-timings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

async function getDefaultTimings() {
  const result = await query(
    `SELECT default_tender_start, default_download_start, default_closing_time,
            default_submission_start, default_submission_end
     FROM tender_default_timings
     LIMIT 1`
  );
  if (result.rows.length === 0) {
    await query(
      `INSERT INTO tender_default_timings (default_tender_start, default_download_start, default_closing_time,
                                           default_submission_start, default_submission_end)
       VALUES (NULL, NULL, NULL, NULL, NULL)`
    );
    return {
      default_tender_start: "",
      default_download_start: "",
      default_closing_time: "",
      default_submission_start: "",
      default_submission_end: "",
    };
  }
  const row = result.rows[0];
  return {
    default_tender_start: row.default_tender_start ? row.default_tender_start.slice(0, 5) : "",
    default_download_start: row.default_download_start ? row.default_download_start.slice(0, 5) : "",
    default_closing_time: row.default_closing_time ? row.default_closing_time.slice(0, 5) : "",
    default_submission_start: row.default_submission_start ? row.default_submission_start.slice(0, 5) : "",
    default_submission_end: row.default_submission_end ? row.default_submission_end.slice(0, 5) : "",
  };
}

async function updateDefaultTimings(timings: any, userId: number) {
  const { default_tender_start, default_download_start, default_closing_time,
          default_submission_start, default_submission_end } = timings;
  await query(
    `UPDATE tender_default_timings
     SET default_tender_start = $1,
         default_download_start = $2,
         default_closing_time = $3,
         default_submission_start = $4,
         default_submission_end = $5,
         updated_by = $6,
         updated_at = NOW()
     WHERE id = 1`,
    [
      default_tender_start || null,
      default_download_start || null,
      default_closing_time || null,
      default_submission_start || null,
      default_submission_end || null,
      userId,
    ]
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any).roleIds || [];
  const userId = (session.user as any).id;
  if (!userRoleIds.includes(ROLE_IDS.ADMIN)) {
    const permCheck = await query(
      `SELECT 1 FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE rp.role_id = (SELECT role_id FROM users WHERE user_id = $1)
       AND p.permission_code = 'manage_tender_timings'
       LIMIT 1`,
      [userId]
    );
    if (permCheck.rows.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const timings = await getDefaultTimings();
    return NextResponse.json(timings);
  } catch (error) {
    console.error("GET /api/admin/tender-timings error:", error);
    return NextResponse.json({ error: "Failed to load timings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any).roleIds || [];
  const userId = (session.user as any).id;
  if (!userRoleIds.includes(ROLE_IDS.ADMIN)) {
    const permCheck = await query(
      `SELECT 1 FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE rp.role_id = (SELECT role_id FROM users WHERE user_id = $1)
       AND p.permission_code = 'manage_tender_timings'
       LIMIT 1`,
      [userId]
    );
    if (permCheck.rows.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const { default_tender_start, default_download_start, default_closing_time,
            default_submission_start, default_submission_end } = body;

    if (typeof default_tender_start !== "string" ||
        typeof default_download_start !== "string" ||
        typeof default_closing_time !== "string" ||
        typeof default_submission_start !== "string" ||
        typeof default_submission_end !== "string") {
      return NextResponse.json(
        { error: "Invalid input: expected string values" },
        { status: 400 }
      );
    }

    await updateDefaultTimings(
      {
        default_tender_start,
        default_download_start,
        default_closing_time,
        default_submission_start,
        default_submission_end,
      },
      userId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/tender-timings error:", error);
    return NextResponse.json({ error: "Failed to update timings" }, { status: 500 });
  }
}