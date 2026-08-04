// app/api/admin/cc-settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

// GET: fetch the list of role IDs that are CC recipients
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can manage CC settings
  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!userRoleIds.includes(1)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // We store a single row with an array of role IDs (PostgreSQL array)
    const result = await query(
      `SELECT role_ids FROM tender_cc_recipients LIMIT 1`
    );

    if (result.rows.length === 0) {
      // If no row exists, return an empty array
      return NextResponse.json({ role_ids: [] });
    }

    return NextResponse.json({ role_ids: result.rows[0].role_ids || [] });
  } catch (error) {
    console.error("GET /api/admin/cc-settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch CC settings" },
      { status: 500 }
    );
  }
}

// PUT: update the list of role IDs
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!userRoleIds.includes(1)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { role_ids } = body;

    if (!Array.isArray(role_ids)) {
      return NextResponse.json(
        { error: "Invalid input: role_ids must be an array" },
        { status: 400 }
      );
    }

    // Check if a row exists; if not, insert one
    const exists = await query(
      `SELECT 1 FROM tender_cc_recipients LIMIT 1`
    );

    if (exists.rows.length === 0) {
      // Insert new row with the provided array
      await query(
        `INSERT INTO tender_cc_recipients (role_ids) VALUES ($1)`,
        [role_ids]
      );
    } else {
      // Update existing row
      await query(
        `UPDATE tender_cc_recipients SET role_ids = $1, updated_at = NOW()`,
        [role_ids]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/cc-settings error:", error);
    return NextResponse.json(
      { error: "Failed to update CC settings" },
      { status: 500 }
    );
  }
}